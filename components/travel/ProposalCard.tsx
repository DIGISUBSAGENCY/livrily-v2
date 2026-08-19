'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { withdrawProposal } from '@/app/(client)/jibli/[id]/actions'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import { AcceptProposalPayment } from '@/components/travel/AcceptProposalPayment'
import { NegotiationThread } from '@/components/travel/NegotiationThread'
import { CounterOfferForm } from '@/components/travel/CounterOfferForm'
import { AgreeToOfferButton } from '@/components/travel/AgreeToOfferButton'
import { IdentityProgressBar } from '@/components/account/IdentityProgressBar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { ErrorText } from '@/components/ui/ErrorText'
import { formatTND } from '@/lib/format'
import { formatDeadline } from '@/lib/travel/formatDeadline'
import { actualGainFromProposal } from '@/lib/travel/estimateGain'
import type { IdentityGateStatus } from '@/lib/identity'
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
  // Uniquement pertinent pour viewerRole="owner" (badge de confiance sur
  // le voyageur qui a proposé) — cf. RPC is_identity_verified, la ligne
  // identity_verifications elle-même reste privée.
  voyageurVerified?: boolean
  // Statut KYC du CLIENT (owner) — acceptProposalVirement/
  // initiateFlouciPayment sont gatées côté serveur (cf. [id]/actions.ts) ;
  // affiché ici pour ne pas laisser le client échouer une soumission avant
  // de découvrir qu'il doit d'abord se vérifier.
  identityStatus?: IdentityGateStatus | null
}

export function ProposalCard({
  proposal,
  offers,
  requestId,
  requestStatus,
  otherPartyName,
  viewerRole,
  bankInfo = null,
  voyageurVerified = false,
  identityStatus = null,
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

  // "Total payé" seulement une fois réellement accepté (accept_travel_proposal
  // crée le paiement séquestre dans la même transaction) — sinon "proposé",
  // pour ne jamais laisser croire qu'un paiement a eu lieu.
  const total = proposal.item_price + proposal.delivery_fee
  const gain = actualGainFromProposal(proposal.item_price, proposal.delivery_fee)
  const expiry = proposal.expires_at ? formatDeadline(proposal.expires_at) : null

  const needsIdentityToPay = viewerRole === 'owner' && identityStatus !== null && identityStatus !== 'approved'

  function renderPaymentStep() {
    if (needsIdentityToPay && identityStatus) {
      return (
        <div className="rounded-lg border border-slate-200 p-3">
          <IdentityProgressBar status={identityStatus} />
          <p className="mt-3 text-sm text-slate-600">
            Ton identité doit être vérifiée avant de pouvoir payer et conclure.
          </p>
          <Link href="/profil/verification-identite" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
            {identityStatus === 'pending' ? 'Voir ma vérification' : 'Vérifier mon identité'}
          </Link>
        </div>
      )
    }
    return <AcceptProposalPayment requestId={requestId} proposalId={proposal.id} bankInfo={bankInfo} />
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        {viewerRole === 'owner' ? (
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-slate-900">{otherPartyName}</p>
            {voyageurVerified && (
              <span
                title="Identité vérifiée"
                className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Voyageur vérifié
              </span>
            )}
          </div>
        ) : (
          <span />
        )}
        <TravelProposalStatusBadge status={proposal.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-500">{proposal.status === 'accepted' ? 'Total payé' : 'Total proposé'}</p>
          <p className="font-semibold text-slate-900">{formatTND(total)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Gain voyageur</p>
          <p className="font-semibold text-brand-700">
            {formatTND(gain.amount)} <span className="text-xs font-normal text-slate-400">(+{gain.percentOfItemPrice}%)</span>
          </p>
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Offre actuelle</p>
        <ProposalAmounts itemPrice={proposal.item_price} deliveryFee={proposal.delivery_fee} />
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-brand-600 hover:underline">Détails</summary>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          {proposal.pickup_city && (
            <p>
              <span className="text-slate-400">Ville de départ : </span>
              {proposal.pickup_city}
            </p>
          )}
          {proposal.travel_date && (
            <p>
              <span className="text-slate-400">Date de livraison : </span>
              {new Date(proposal.travel_date).toLocaleDateString('fr-TN')}
            </p>
          )}
          <p>
            <span className="text-slate-400">Envoyée le : </span>
            {new Date(proposal.created_at).toLocaleDateString('fr-TN')}
          </p>
          {expiry && (
            <p>
              <span className="text-slate-400">Expire dans : </span>
              {expiry.countdown}
            </p>
          )}
        </div>
      </details>

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
        <Alert tone="success" className="mt-3">
          <p className="font-medium">
            Le voyageur a accepté cette offre — finalise en payant pour conclure.
          </p>
          <div className="mt-2">{renderPaymentStep()}</div>
        </Alert>
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
            renderPaymentStep()
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
