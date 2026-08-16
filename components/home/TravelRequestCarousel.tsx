'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Package, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { getPublicStorageUrl } from '@/lib/storage'
import { formatTND } from '@/lib/format'
import { estimateSuggestedGain, actualGainFromProposal } from '@/lib/travel/estimateGain'
import type { TravelRequest } from '@/types/database'

interface TravelRequestCarouselProps {
  requests: TravelRequest[]
  // Propositions du voyageur courant, par request_id — cf. RequestCard sur
  // /jibli, même logique et même raison (RLS).
  ownProposalsByRequest?: Record<string, { item_price: number; delivery_fee: number }>
}

// Défilement horizontal fait main (pas de librairie de carousel dans ce
// projet) : overflow-x-auto + scroll-snap, deux boutons qui appellent
// scrollBy sur le conteneur. Dégrade proprement au clavier/tactile même
// sans JS (le scroll natif fonctionne toujours).
export function TravelRequestCarousel({ requests, ownProposalsByRequest = {} }: TravelRequestCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  function scrollByCards(direction: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: direction * 300, behavior: 'smooth' })
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
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {requests.map((request) => {
          const ownProposal = ownProposalsByRequest[request.id] ?? null
          const gain = ownProposal
            ? actualGainFromProposal(ownProposal.item_price, ownProposal.delivery_fee)
            : estimateSuggestedGain(request.budget_max)

          return (
            <Link
              key={request.id}
              href={`/jibli/${request.id}`}
              className="group w-64 flex-shrink-0 snap-start"
            >
              <Card interactive className="flex h-full flex-col">
                <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {request.item_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photos utilisateur, pas d'optimisation next/image nécessaire pour l'instant
                    <img
                      src={getPublicStorageUrl('travel-request-photos', request.item_photo_url)}
                      alt={request.item_description}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <Package className="h-8 w-8 text-slate-400" aria-hidden />
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
    </div>
  )
}
