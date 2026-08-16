'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { withdrawProposal } from '@/app/(client)/jibli/[id]/actions'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import { AcceptProposalPayment } from '@/components/travel/AcceptProposalPayment'
import { NegotiationThread } from '@/components/travel/NegotiationThread'
import { CounterOfferForm } from '@/components/travel/CounterOfferForm'
import { AgreeToOfferButton } from '@/components/travel/AgreeToOfferButton'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ErrorText } from '@/components/ui/ErrorText'
import type { BankTransferInfo, TravelProposal, TravelProposalOffer, TravelRequestStatus } from '@/types/database'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib' | 'flouci_phone'>

interface ProposalCardProps {
  proposal: TravelProposal
  offers: TravelProposalOffer[]
  requestId: string
  requestStatus: TravelRequestStatus
  // Nom de l'AUTRE partie du fil : le voyageur pour le client propriétaire,
  // le client pour le voyageur.
  otherPartyName: string
  viewerRole: 'owner' | 'voyageur'
  bankInfo?: PlatformPaymentInfo | null
}

export function ProposalCard({
  proposal,
  offers,
  requestId,
  requestStatus,
  otherPartyName,
  viewerRole,
  bankInfo = null,
}: ProposalCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleWithdraw() {
    setError(null)
    startTransition(async () => {
      const result = await withdrawProposal(requestId, proposal.id)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  const negotiationActive = proposal.status === 'pending' && requestStatus === 'open'
  // "Mon tour" : c'est à moi de répondre au dernier coup de l'autre partie
  // (impossible de contre-proposer sur sa propre dernière offre, cf.
  // submit_counter_offer côté base). Pour le voyageur, un accord déjà posé
  // sur l'offre courante (terms_confirmed_by) referme la fenêtre d'action —
  // il ne reste plus qu'à attendre le paiement du client.
  const isMyTurn =
    negotiationActive &&
    ((viewerRole === 'owner' && proposal.last_offer_by === 'voyageur') ||
      (viewerRole === 'voyageur' && proposal.last_offer_by === 'client' && !proposal.terms_confirmed_by))
  const voyageurAgreedAwaitingPayment =
    negotiationActive && proposal.last_offer_by === 'client' && Boolean(proposal.terms_confirmed_by)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        {viewerRole === 'owner' ? <p className="font-medium text-slate-900">{otherPartyName}</p> : <span />}
        <TravelProposalStatusBadge status={proposal.status} />
      </div>

      {proposal.travel_date && (
        <p className="mt-1 text-sm text-slate-500">
          Retour prévu le {new Date(proposal.travel_date).toLocaleDateString('fr-TN')}
        </p>
      )}

      <div className="mt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Offre actuelle</p>
        <ProposalAmounts itemPrice={proposal.item_price} deliveryFee={proposal.delivery_fee} />
      </div>

      {offers.length > 1 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-brand-600 hover:underline">
            Historique de la négociation ({offers.length})
          </summary>
          <div className="mt-3">
            <NegotiationThread offers={offers} viewerRole={viewerRole} otherPartyName={otherPartyName} />
          </div>
        </details>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      {voyageurAgreedAwaitingPayment && viewerRole === 'owner' && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-sm font-medium text-brand-800">
            Le voyageur a accepté cette offre — finalise en payant pour conclure.
          </p>
          <div className="mt-2">
            <AcceptProposalPayment requestId={requestId} proposalId={proposal.id} bankInfo={bankInfo} />
          </div>
        </div>
      )}

      {voyageurAgreedAwaitingPayment && viewerRole === 'voyageur' && (
        <p className="mt-3 text-sm text-brand-700">
          Tu as accepté cette offre — en attente du paiement du client pour conclure.
        </p>
      )}

      {negotiationActive && !isMyTurn && !voyageurAgreedAwaitingPayment && (
        <p className="mt-3 text-sm text-slate-500">En attente de la réponse de {otherPartyName}.</p>
      )}

      {isMyTurn && (
        <div className="mt-3 space-y-3">
          {viewerRole === 'owner' ? (
            <AcceptProposalPayment requestId={requestId} proposalId={proposal.id} bankInfo={bankInfo} />
          ) : (
            <AgreeToOfferButton requestId={requestId} proposalId={proposal.id} />
          )}
          <CounterOfferForm
            requestId={requestId}
            proposalId={proposal.id}
            currentItemPrice={proposal.item_price}
            currentDeliveryFee={proposal.delivery_fee}
          />
        </div>
      )}

      {viewerRole === 'voyageur' && proposal.status === 'pending' && (
        <Button size="sm" variant="danger" className="mt-3" disabled={isPending} onClick={handleWithdraw}>
          Retirer ma proposition
        </Button>
      )}
    </Card>
  )
}
