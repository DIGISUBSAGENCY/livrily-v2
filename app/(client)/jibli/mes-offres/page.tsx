import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductOfferStatusBadge } from '@/components/travel/ProductOfferStatusBadge'
import { CancelOfferButton } from '@/components/travel/CancelOfferButton'
import { BoostBadge, isBoosted } from '@/components/travel/BoostBadge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata: Metadata = pageMetadata({
  title: 'Mes offres',
  description: 'Tes offres de produits publiées en tant que voyageur sur Livrily.',
  noIndex: true,
})

// Mirror de mes-propositions/page.tsx — pas d'onglets (contrairement à
// ProposalsTabs) : le volume d'offres par voyageur ne justifie pas encore
// cette complexité, ajoutable plus tard sur le même modèle si besoin.
export default async function MyProductOffersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/mes-offres')

  const { data: offers, error } = await supabase
    .from('product_offers')
    .select('*')
    .eq('voyageur_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli/offres" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Offres
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Mes offres</h1>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger tes offres.</p>}

      {!error && offers && offers.length === 0 && (
        <EmptyState icon={Tag}>
          <p>Tu n&apos;as encore publié aucune offre.</p>
          <Link href="/jibli/offres/nouveau" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
            Publier une offre
          </Link>
        </EmptyState>
      )}

      {!error && offers && offers.length > 0 && (
        <div className="mt-6 space-y-3">
          {offers.map((offer) => (
            <Card key={offer.id} className="flex items-center justify-between gap-3">
              <Link href={`/jibli/offres/${offer.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900 hover:text-brand-700">{offer.item_description}</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {offer.origin_country} → {offer.destination_city} · {formatTND(offer.item_price + offer.delivery_fee)}
                </p>
              </Link>
              <div className="flex flex-shrink-0 items-center gap-2">
                {isBoosted(offer.boosted_until) && <BoostBadge />}
                <ProductOfferStatusBadge status={offer.status} />
                {offer.status === 'open' && (
                  <>
                    {/* Bonus (pas une dépendance bloquante, cf. plan validé)
                        — mène à la fiche détail, où vit le formulaire
                        d'achat complet (BoostPayment), pas dupliqué ici. */}
                    <Link href={`/jibli/offres/${offer.id}`}>
                      <Button size="sm" variant="secondary">
                        Booster
                      </Button>
                    </Link>
                    <CancelOfferButton offerId={offer.id} />
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
