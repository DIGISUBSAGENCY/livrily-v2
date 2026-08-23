import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { RequestPhotoPlaceholder } from '@/components/travel/RequestPhotoPlaceholder'
import { getPublicStorageUrl } from '@/lib/storage'
import { formatTND } from '@/lib/format'
import type { ProductOffer } from '@/types/database'

// Mirror de RequestCard (photo, description, route) + TripCard (date) —
// contrairement aux deux, le prix affiché est FIXE, pas une estimation ni
// un point de départ : item_price + delivery_fee, jamais fusionnés en un
// total qui masquerait la répartition (même principe que ProposalAmounts).
export function ProductOfferCard({ offer }: { offer: ProductOffer }) {
  const total = offer.item_price + offer.delivery_fee

  return (
    <Link href={`/jibli/offres/${offer.id}`} className="group block h-full">
      <Card interactive className="flex h-full items-start gap-4">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
          {offer.item_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- photos utilisateur, pas d'optimisation next/image nécessaire pour l'instant
            <img
              src={getPublicStorageUrl('travel-request-photos', offer.item_photo_url)}
              alt={offer.item_description}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <RequestPhotoPlaceholder className="h-full w-full" iconClassName="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-slate-900 transition-colors group-hover:text-brand-700">
            {offer.item_description}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {offer.origin_country} → {offer.destination_city}
          </p>
          <p className="text-sm text-slate-500">{new Date(offer.travel_date).toLocaleDateString('fr-TN')}</p>
          <p className="mt-1 text-sm font-semibold text-brand-700">{formatTND(total)}</p>
        </div>
      </Card>
    </Link>
  )
}
