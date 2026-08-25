'use client'

import { useFormState } from 'react-dom'
import { depositWalletVirement, type WalletDepositActionState } from '@/app/(client)/parrainage/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { BankTransferInfo } from '@/types/database'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib'>

const initialState: WalletDepositActionState = { error: null }

// Virement uniquement pour cette brique (brique 2/N ajoutera Flouci —
// mirror du pattern à deux méthodes déjà utilisé par AcceptProposalPayment/
// BoostPayment, pas construit d'avance ici pour rester testable seul).
// Montant libre (contrairement à BoostPayment, tarif fixe par palier) :
// c'est un dépôt, l'utilisateur choisit combien il veut créditer.
export function WalletDepositForm({ bankInfo }: { bankInfo: PlatformPaymentInfo | null }) {
  const [state, formAction] = useFormState(depositWalletVirement, initialState)

  if (!bankInfo) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <p className="text-sm text-amber-700">Coordonnées bancaires non configurées, réessaie plus tard.</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <Label htmlFor="amount">Montant à déposer (TND)</Label>
        <Input id="amount" name="amount" type="number" step="0.001" min="0.001" required hasError={!!state.error} />
      </div>
      <div className="text-sm text-slate-600">
        <p>
          <span className="text-slate-500">Banque : </span>
          {bankInfo.bank_name}
        </p>
        <p>
          <span className="text-slate-500">Titulaire : </span>
          {bankInfo.account_holder}
        </p>
        <p className="font-mono">
          <span className="font-sans text-slate-500">RIB : </span>
          {bankInfo.rib}
        </p>
      </div>
      <div>
        <Label htmlFor="payment_proof">Preuve de virement</Label>
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
        Confirmer le virement
      </SubmitButton>
    </form>
  )
}
