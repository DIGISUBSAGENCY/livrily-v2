'use client'

import { useFormState } from 'react-dom'
import { submitCounterOffer } from '@/app/(client)/jibli/[id]/actions'
import type { ProposalFormState } from '@/app/(client)/jibli/[id]/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ProposalFormState = { error: null }

interface CounterOfferFormProps {
  requestId: string
  proposalId: string
  currentItemPrice: number
  currentDeliveryFee: number
}

// Préremplie avec l'offre courante : l'autre partie ajuste plutôt que de
// retaper les montants de zéro à chaque tour.
export function CounterOfferForm({ requestId, proposalId, currentItemPrice, currentDeliveryFee }: CounterOfferFormProps) {
  const action = submitCounterOffer.bind(null, requestId, proposalId)
  const [state, formAction] = useFormState(action, initialState)

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="counter_item_price">Prix de l&apos;objet (DT)</Label>
          <Input
            id="counter_item_price"
            name="item_price"
            type="number"
            step="0.001"
            min="0"
            defaultValue={currentItemPrice}
            required
            hasError={!!state.error}
          />
        </div>
        <div>
          <Label htmlFor="counter_delivery_fee">Frais de service (DT)</Label>
          <Input
            id="counter_delivery_fee"
            name="delivery_fee"
            type="number"
            step="0.001"
            min="0"
            defaultValue={currentDeliveryFee}
            required
            hasError={!!state.error}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="counter_message">Message (optionnel)</Label>
        <textarea
          id="counter_message"
          name="message"
          rows={2}
          placeholder="Pourquoi ce montant…"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton size="sm" pendingLabel="Envoi…">
        Envoyer ma contre-offre
      </SubmitButton>
    </form>
  )
}
