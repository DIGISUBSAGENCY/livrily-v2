import type { Metadata } from 'next'
import Link from 'next/link'
import { Tag, Luggage } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductOfferCard } from '@/components/travel/ProductOfferCard'
import { ProductOfferFilters, type ProductOfferSort } from '@/components/travel/ProductOfferFilters'
import { Button } from '@/components/ui/Button'
import { pageMetadata } from '@/lib/seo'
import { getPublicProfileSummaries } from '@/lib/profiles'

export const metadata: Metadata = pageMetadata({
  title: 'Offres',
  description: 'Découvre des produits précis proposés à un prix déjà fixé par des voyageurs sur Livrily.',
})

interface ProductOffersPageProps {
  searchParams: Promise<{ origin?: string; destination?: string; sort?: string }>
}

// Mirror simplifié de /jibli/trips — même absence de bloc dashboard/stats,
// même raison (volume).
export default async function ProductOffersPage({ searchParams }: ProductOffersPageProps) {
  const { origin, destination, sort: sortParam } = await searchParams
  const sort: ProductOfferSort = sortParam === 'date_asc' ? sortParam : 'recent'
  const supabase = await createClient()

  // 'open' + 'matched' : une offre prise reste visible avec son statut à
  // jour (badge "Prise" sur ProductOfferCard) plutôt que de disparaître —
  // 'completed'/'cancelled' restent filtrés, mêmes raisons que
  // /jibli/trips/page.tsx (bruit pas utile à la découverte au quotidien).
  let query = supabase.from('product_offers').select('*').in('status', ['open', 'matched'])

  if (origin) query = query.ilike('origin_country', `%${origin}%`)
  if (destination) query = query.ilike('destination_city', `%${destination}%`)

  if (sort === 'date_asc') query = query.order('travel_date', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  const { data: offers, error } = await query

  // Un seul appel batché pour toute la page (get_public_profile_summaries),
  // pas un par carte — cf. lib/profiles.ts.
  const profiles = await getPublicProfileSummaries(supabase, (offers ?? []).map((o) => o.voyageur_id))

  const hasActiveFilters = Boolean(origin || destination)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Tag className="h-6 w-6 text-brand-600" aria-hidden />
            Offres
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Des voyageurs annoncent un produit précis, à un prix déjà fixé — prends-le directement.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jibli">
            <Button variant="secondary" size="sm">
              <Luggage className="h-4 w-4" aria-hidden />
              Voir les demandes
            </Button>
          </Link>
          <Link href="/jibli/offres/nouveau">
            <Button size="sm">Publier une offre</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <ProductOfferFilters defaultOrigin={origin ?? ''} defaultDestination={destination ?? ''} defaultSort={sort} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les offres.</p>}

      {!error && offers && (
        <p className="mt-6 text-sm text-slate-500">
          {offers.length} offre{offers.length !== 1 ? 's' : ''} trouvée{offers.length !== 1 ? 's' : ''}
        </p>
      )}

      {!error && offers && offers.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center text-slate-500">
          <Tag className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          {hasActiveFilters ? (
            <>
              <p>Aucune offre ne correspond à ces filtres.</p>
              <Link href="/jibli/offres" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
                Réinitialiser les filtres
              </Link>
            </>
          ) : (
            <p>Aucune offre publiée pour l&apos;instant.</p>
          )}
        </div>
      )}

      {!error && offers && offers.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <ProductOfferCard
              key={offer.id}
              offer={offer}
              ownerName={profiles.get(offer.voyageur_id)?.fullName ?? null}
              ownerAvatarUrl={profiles.get(offer.voyageur_id)?.avatarUrl ?? null}
            />
          ))}
        </div>
      )}
    </main>
  )
}
