'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { TravelProposal, TravelRequestStatus } from '@/types/database'

type TabKey = 'received' | 'active' | 'history'

interface ProposalsTabsProps {
  proposals: TravelProposal[]
  requestById: Map<string, { item_description: string; status: TravelRequestStatus }>
}

// Regroupe MES propositions envoyées (en tant que voyageur) — "Reçues" ne
// désigne pas des propositions reçues sur mes propres demandes (ça, c'est
// ReceivedProposalsPreview côté client), mais les fils où le CLIENT vient
// de contre-proposer : c'est à moi de répondre.
export function ProposalsTabs({ proposals, requestById }: ProposalsTabsProps) {
  const received = proposals.filter((p) => p.status === 'pending' && p.last_offer_by === 'client')
  const active = proposals.filter(
    (p) => p.status === 'accepted' || (p.status === 'pending' && p.last_offer_by === 'voyageur')
  )
  const history = proposals.filter((p) => p.status === 'rejected' || p.status === 'withdrawn')

  const tabs: { key: TabKey; label: string; items: TravelProposal[]; emptyText: string }[] = [
    { key: 'received', label: 'Reçues', items: received, emptyText: "Aucune contre-offre du client en attente de ta réponse." },
    { key: 'active', label: 'Actives', items: active, emptyText: 'Aucune proposition active pour le moment.' },
    { key: 'history', label: 'Historique', items: history, emptyText: 'Aucune proposition close.' },
  ]

  const [tab, setTab] = useState<TabKey>(received.length > 0 ? 'received' : 'active')
  const current = tabs.find((t) => t.key === tab)!

  return (
    <div className="mt-6">
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label} {t.items.length > 0 && `(${t.items.length})`}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {current.items.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">{current.emptyText}</p>
        )}
        {current.items.map((proposal) => {
          const request = requestById.get(proposal.request_id)
          return (
            <Link key={proposal.id} href={`/jibli/${proposal.request_id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{request?.item_description ?? 'Demande'}</p>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <TravelProposalStatusBadge status={proposal.status} />
                    {request && <TravelRequestStatusBadge status={request.status} />}
                  </div>
                </div>
                <div className="mt-2">
                  <ProposalAmounts itemPrice={proposal.item_price} deliveryFee={proposal.delivery_fee} />
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
