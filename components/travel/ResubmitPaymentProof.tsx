'use client'

import { useFormState } from 'react-dom'
import { resubmitTravelPaymentProof } from '@/app/(client)/jibli/[id]/actions'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { ActionResult } from '@/app/(client)/jibli/[id]/actions'

const initialState: ActionResult = { error: null }

// Affiché sur /jibli/[id] uniquement quand le paiement virement du client
// est 'rejected' (chantier admin completeness, Option B) — même formulaire
// minimal upload-de-preuve que le volet virement d'AcceptProposalPayment,
// sans le sélecteur de méthode (le paiement existe déjà, seule la preuve
// change).
export function ResubmitPaymentProof({ requestId }: { requestId: string }) {
  const action = resubmitTravelPaymentProof.bind(null, requestId)
  const [state, formAction] = useFormState(action, initialState)

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
      <p className="text-sm font-medium text-slate-900">
        Ta preuve de virement a été refusée — renvoie une nouvelle capture pour que la vérification reprenne.
      </p>
      <form action={formAction} className="space-y-3">
        <div>
          <Label htmlFor="payment_proof">Nouvelle preuve de virement</Label>
          <input
            id="payment_proof"
            name="payment_proof"
            type="file"
            accept="image/*"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </div>
        {state.error && <ErrorText>{state.error}</ErrorText>}
        <SubmitButton size="sm" pendingLabel="Envoi…">
          Renvoyer la preuve
        </SubmitButton>
      </form>
    </div>
  )
}
