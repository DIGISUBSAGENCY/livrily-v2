import Link from 'next/link'
import { Inbox } from 'lucide-react'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { TravelProposal } from '@/types/database'

interface ReceivedProposalsPreviewProps {
  proposals: TravelProposal[]
  voyageurNames: Map<string, string>
  requestItemById: Map<string, string>
  totalCount: number
  // Différencie le message/CTA de l'état vide : sans aucune demande
  // publiée, il ne peut structurellement pas y avoir de proposition reçue
  // — le vrai geste à faire est d'en publier une, pas de "voir" une liste
  // vide de demandes.
  hasAnyRequest: boolean
}

// Même principe que MyRequestsPreview/MyProposalsPreview : version
// condensée des propositions reçues par les voyageurs sur mes demandes.
// Pas de page dédiée "toutes mes propositions reçues" pour l'instant —
// "Voir tout" renvoie vers /jibli/mes-demandes, d'où on accède au détail
// de chaque demande et ses propositions.
export function ReceivedProposalsPreview({
  proposals,
  voyageurNames,
  requestItemById,
  totalCount,
  hasAnyRequest,
}: ReceivedProposalsPreviewProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Propositions reçues</h2>
        {totalCount > 0 && (
          <Link href="/jibli/mes-demandes" className="text-sm font-medium text-brand-600 hover:underline">
            Voir tout ({totalCount})
          </Link>
        )}
      </div>

      {proposals.length === 0 && (
        <Card className="flex flex-col items-center py-10 text-center text-slate-500">
          <Inbox className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          {hasAnyRequest ? (
            <>
              <p>Aucune proposition reçue pour l&apos;instant.</p>
              <p className="mt-1 text-sm">Les voyageurs intéressés apparaîtront ici.</p>
              <Link href="/jibli/mes-demandes" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
                Voir mes demandes
              </Link>
            </>
          ) : (
            <>
              <p>Publie une demande pour commencer à recevoir des propositions.</p>
              <Link href="/jibli/nouvelle-demande" className="mt-3">
                <Button size="sm">Publier une demande</Button>
              </Link>
            </>
          )}
        </Card>
      )}

      {proposals.length > 0 && (
        <div className="space-y-3">
          {proposals.map((proposal) => (
            <Link key={proposal.id} href={`/jibli/${proposal.request_id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {requestItemById.get(proposal.request_id) ?? 'Demande'}
                    </p>
                    <p className="text-xs text-slate-500">{voyageurNames.get(proposal.voyageur_id) ?? 'Voyageur'}</p>
                  </div>
                  <TravelProposalStatusBadge status={proposal.status} />
                </div>
                <div className="mt-2">
                  <ProposalAmounts itemPrice={proposal.item_price} deliveryFee={proposal.delivery_fee} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
