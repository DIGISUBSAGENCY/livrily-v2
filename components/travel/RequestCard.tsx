import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { RequestPhotoPlaceholder } from '@/components/travel/RequestPhotoPlaceholder'
import { getPublicStorageUrl } from '@/lib/storage'
import { formatTND } from '@/lib/format'
import { estimateSuggestedGain, actualGainFromProposal } from '@/lib/travel/estimateGain'
import type { TravelRequest } from '@/types/database'

interface RequestCardProps {
  request: TravelRequest
  // Renseigné uniquement si le voyageur courant a déjà une proposition sur
  // cette demande (cf. RLS : impossible de voir celles des autres) — dans
  // ce cas le badge affiche son gain réel plutôt qu'une suggestion.
  ownProposal?: { item_price: number; delivery_fee: number } | null
}

export function RequestCard({ request, ownProposal }: RequestCardProps) {
  const gain = ownProposal
    ? actualGainFromProposal(ownProposal.item_price, ownProposal.delivery_fee)
    : estimateSuggestedGain(request.budget_max)

  return (
    <Link href={`/jibli/${request.id}`} className="group block h-full">
      <Card interactive className="flex h-full items-start gap-4">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
          {request.item_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- photos utilisateur, pas d'optimisation next/image nécessaire pour l'instant
            <img
              src={getPublicStorageUrl('travel-request-photos', request.item_photo_url)}
              alt={request.item_description}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <RequestPhotoPlaceholder className="h-full w-full" iconClassName="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-slate-900 transition-colors group-hover:text-brand-700">
            {request.item_description}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {request.origin_country} → {request.destination_city}
          </p>
          <p className="mt-1 text-sm font-medium text-brand-700">
            Budget max : {formatTND(request.budget_max)}
          </p>

          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            {ownProposal ? 'Ta proposition' : 'Gain voyageur'} : {formatTND(gain.amount)} (+{gain.percentOfItemPrice}%)
          </div>
          {!ownProposal && <p className="mt-1 text-xs text-slate-400">Estimation, à affiner en proposant.</p>}
        </div>
      </Card>
    </Link>
  )
}
