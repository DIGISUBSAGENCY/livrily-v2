import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import type { TravelProposalOffer } from '@/types/database'

interface NegotiationThreadProps {
  offers: TravelProposalOffer[]
  // Nom affiché pour les entrées qui ne sont pas celles du viewer courant
  // (le voyageur pour le client propriétaire, "Le client" pour le voyageur —
  // cf. RLS travel_proposal_offers : le viewer ne voit jamais que son propre
  // fil, donc author_role suffit à distinguer "moi" de "l'autre").
  viewerRole: 'owner' | 'voyageur'
  otherPartyName: string
}

// Fil de négociation, du plus ancien au plus récent (offers déjà triées à
// la lecture) — un fil vide ne devrait jamais arriver en pratique (le
// trigger log_initial_negotiation_offer garantit au moins une entrée dès la
// création de la proposition), mais rendu défensif quand même.
export function NegotiationThread({ offers, viewerRole, otherPartyName }: NegotiationThreadProps) {
  if (offers.length === 0) return null

  return (
    <div className="space-y-3">
      {offers.map((offer) => {
        const isMine = (viewerRole === 'owner' && offer.author_role === 'client') || (viewerRole === 'voyageur' && offer.author_role === 'voyageur')
        const authorLabel = isMine ? 'Toi' : otherPartyName

        return (
          <div key={offer.id} className={`rounded-lg border p-3 ${isMine ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{authorLabel}</p>
              <p className="text-xs text-slate-400">{new Date(offer.created_at).toLocaleString('fr-TN')}</p>
            </div>
            <div className="mt-2">
              <ProposalAmounts itemPrice={offer.item_price} deliveryFee={offer.delivery_fee} />
            </div>
            {offer.message && <p className="mt-2 text-sm text-slate-600">{offer.message}</p>}
          </div>
        )
      })}
    </div>
  )
}
