import Link from 'next/link'
import { Tag } from 'lucide-react'
import { ProductOfferStatusBadge } from '@/components/travel/ProductOfferStatusBadge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import type { ProductOffer } from '@/types/database'

interface MyOffersPreviewProps {
  offers: ProductOffer[]
  totalCount: number
}

// Mirror exact de MyRequestsPreview.tsx (même structure, même pattern
// d'état vide) — version condensée de /jibli/mes-offres (3 max + lien
// "voir tout"), rien n'existait encore pour product_offers avant ce
// chantier.
export function MyOffersPreview({ offers, totalCount }: MyOffersPreviewProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Mes articles en vente</h2>
        {totalCount > 0 && (
          <Link href="/jibli/mes-offres" className="text-sm font-medium text-brand-600 hover:underline">
            Voir tout ({totalCount})
          </Link>
        )}
      </div>

      {offers.length === 0 && (
        <Card className="flex flex-col items-center py-10 text-center text-slate-500">
          <Tag className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Tu n&apos;as encore publié aucun article.</p>
          <Link href="/jibli/offres/nouveau" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
            Publier un article
          </Link>
        </Card>
      )}

      {offers.length > 0 && (
        <div className="space-y-3">
          {offers.map((offer) => (
            <Link key={offer.id} href={`/jibli/offres/${offer.id}`}>
              <Card className="flex items-center justify-between gap-4 transition-shadow hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{offer.item_description}</p>
                  <p className="text-xs text-slate-500">
                    {offer.origin_country} → {offer.destination_city} · {formatTND(offer.item_price + offer.delivery_fee)}
                  </p>
                </div>
                <ProductOfferStatusBadge status={offer.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
