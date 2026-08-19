'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, TrendingUp, Flame, Snowflake } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { RequestPhotoPlaceholder } from '@/components/travel/RequestPhotoPlaceholder'
import { cn } from '@/lib/utils'
import { getPublicStorageUrl } from '@/lib/storage'
import { formatTND } from '@/lib/format'
import { estimateSuggestedGain, actualGainFromProposal } from '@/lib/travel/estimateGain'
import type { TravelTrend } from '@/lib/travel/getTravelTrend'
import type { TravelRequest } from '@/types/database'

interface TravelRequestCarouselProps {
  requests: TravelRequest[]
  // Propositions du voyageur courant, par request_id — cf. RequestCard sur
  // /jibli, même logique et même raison (RLS).
  ownProposalsByRequest?: Record<string, { item_price: number; delivery_fee: number }>
  // 🔥/❄️ par request_id, calculé côté serveur via un RPC agrégat (un
  // visiteur public ne peut pas lire travel_proposals directement).
  trendByRequest?: Record<string, TravelTrend>
}

// Largeur d'une carte (w-64 = 256px) + gap-4 (16px) — sert au calcul de
// scroll par carte (boutons flèches) et à l'indicateur de pagination.
const CARD_STEP = 272

// Défilement horizontal fait main (pas de librairie de carousel dans ce
// projet) : overflow-x-auto + scroll-snap, deux boutons qui appellent
// scrollBy sur le conteneur. Dégrade proprement au clavier/tactile même
// sans JS (le scroll natif fonctionne toujours).
export function TravelRequestCarousel({
  requests,
  ownProposalsByRequest = {},
  trendByRequest = {},
}: TravelRequestCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  function scrollByCards(direction: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: direction * CARD_STEP, behavior: 'smooth' })
  }

  function scrollToIndex(index: number) {
    scrollerRef.current?.scrollTo({ left: index * CARD_STEP, behavior: 'smooth' })
  }

  function handleScroll() {
    if (!scrollerRef.current) return
    const index = Math.round(scrollerRef.current.scrollLeft / CARD_STEP)
    setActiveIndex(Math.max(0, Math.min(index, requests.length - 1)))
  }

  if (requests.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500">Aucune demande ouverte pour l&apos;instant.</p>
    )
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {requests.map((request) => {
          const ownProposal = ownProposalsByRequest[request.id] ?? null
          const gain = ownProposal
            ? actualGainFromProposal(ownProposal.item_price, ownProposal.delivery_fee)
            : estimateSuggestedGain(request.budget_max)
          const trend = trendByRequest[request.id] ?? null

          return (
            <Link
              key={request.id}
              href={`/jibli/${request.id}`}
              className="group w-64 flex-shrink-0 snap-start"
            >
              <Card interactive className="flex h-full flex-col">
                <div className="relative h-32 w-full overflow-hidden rounded-lg">
                  {request.item_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photos utilisateur, pas d'optimisation next/image nécessaire pour l'instant
                    <img
                      src={getPublicStorageUrl('travel-request-photos', request.item_photo_url)}
                      alt={request.item_description}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <RequestPhotoPlaceholder className="h-full w-full" iconClassName="h-8 w-8" />
                  )}
                  {trend && (
                    <div
                      className={cn(
                        'absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-white shadow-soft',
                        trend === 'hot' ? 'bg-orange-500' : 'bg-blue-500'
                      )}
                    >
                      {trend === 'hot' ? (
                        <Flame className="h-3 w-3" aria-hidden />
                      ) : (
                        <Snowflake className="h-3 w-3" aria-hidden />
                      )}
                      {trend === 'hot' ? 'Tendance' : 'Peu de demande'}
                    </div>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 font-medium text-slate-900">{request.item_description}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {request.origin_country} → {request.destination_city}
                </p>
                <p className="mt-2 text-sm font-semibold text-brand-700">
                  Budget jusqu&apos;à {formatTND(request.budget_max)}
                </p>

                <div className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  {ownProposal ? 'Ta proposition' : 'Gain voyageur'} : {formatTND(gain.amount)} (+{gain.percentOfItemPrice}%)
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollByCards(-1)}
        aria-label="Précédent"
        className="absolute -left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow-soft transition-colors hover:bg-slate-50 sm:flex"
      >
        <ChevronLeft className="h-4 w-4 text-slate-600" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => scrollByCards(1)}
        aria-label="Suivant"
        className="absolute -right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-slate-200 bg-white p-2 shadow-soft transition-colors hover:bg-slate-50 sm:flex"
      >
        <ChevronRight className="h-4 w-4 text-slate-600" aria-hidden />
      </button>

      {requests.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {requests.map((request, index) => (
            <button
              key={request.id}
              type="button"
              onClick={() => scrollToIndex(index)}
              aria-label={`Aller à la demande ${index + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === activeIndex ? 'w-4 bg-brand-600' : 'w-1.5 bg-slate-300'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
