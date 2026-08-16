'use client'

import { useFormState } from 'react-dom'
import { createProposal, type ProposalFormState } from '@/app/(client)/jibli/[id]/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ProposalFormState = { error: null }

export function ProposalForm({ requestId }: { requestId: string }) {
  const action = createProposal.bind(null, requestId)
  const [state, formAction] = useFormState(action, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="item_price">Prix de l&apos;objet (DT)</Label>
          <Input id="item_price" name="item_price" type="number" step="0.001" min="0" required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="delivery_fee">Frais de service (DT)</Label>
          <Input id="delivery_fee" name="delivery_fee" type="number" step="0.001" min="0" required hasError={!!state.error} />
        </div>
      </div>

      <div>
        <Label htmlFor="travel_date">Date de retour prévue (optionnel)</Label>
        <Input id="travel_date" name="travel_date" type="date" />
      </div>

      <div>
        <Label htmlFor="message">Message (optionnel)</Label>
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Précise tes disponibilités, comment récupérer l'objet…"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Envoyer ma proposition
      </SubmitButton>
    </form>
  )
}
