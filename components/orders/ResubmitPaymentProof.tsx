'use client'

import { useFormState } from 'react-dom'
import { resubmitPaymentProof, type ActionResult } from '@/app/(client)/commandes/[id]/actions'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { Card } from '@/components/ui/Card'

const initialState: ActionResult = { error: null }

// Affiché uniquement quand payment_method='virement' && payment_status='rejected'
// && status='pending' (cf. app/(client)/commandes/[id]/page.tsx).
export function ResubmitPaymentProof({ orderId }: { orderId: string }) {
  const action = resubmitPaymentProof.bind(null, orderId)
  const [state, formAction] = useFormState(action, initialState)

  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="font-semibold text-red-900">Paiement rejeté</h2>
      <p className="mt-1 text-sm text-red-800">
        La preuve envoyée n&apos;a pas été validée. Renvoie une nouvelle capture d&apos;écran du
        virement.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
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
    </Card>
  )
}
