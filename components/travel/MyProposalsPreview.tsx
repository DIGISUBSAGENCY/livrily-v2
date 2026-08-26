import Link from 'next/link'
import { Luggage } from 'lucide-react'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import { Card } from '@/components/ui/Card'
import type { TravelProposal, TravelRequestStatus } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'

interface MyProposalsPreviewProps {
  proposals: TravelProposal[]
  requestById: Map<string, { item_description: string; status: TravelRequestStatus }>
  totalCount: number
}

// Même principe que MyRequestsPreview : version condensée de
// /jibli/mes-propositions.
export function MyProposalsPreview({ proposals, requestById, totalCount }: MyProposalsPreviewProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Mes propositions</h2>
        {totalCount > 0 && (
          <Link href="/jibli/mes-propositions" className="text-sm font-medium text-brand-600 hover:underline">
            Voir tout ({totalCount})
          </Link>
        )}
      </div>

      {proposals.length === 0 && (
        <Card>
          <EmptyState icon={Luggage} className="mt-0 py-4">
            <p>Tu n&apos;as encore fait aucune proposition.</p>
            <p className="mt-1 text-sm">Parcours les demandes ouvertes pour en faire une.</p>
            <a href="#demandes-ouvertes" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
              Voir les demandes ouvertes
            </a>
          </EmptyState>
        </Card>
      )}

      {proposals.length > 0 && (
        <div className="space-y-3">
          {proposals.map((proposal) => {
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
      )}
    </section>
  )
}
