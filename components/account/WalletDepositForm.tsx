'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import {
  depositWalletVirement,
  initiateWalletDepositFlouci,
  type WalletDepositActionState,
} from '@/app/(client)/jibli/dashboard/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { cn } from '@/lib/utils'
import type { BankTransferInfo } from '@/types/database'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib' | 'flouci_phone'>

const initialState: WalletDepositActionState = { error: null }

// Mirror d'AcceptProposalPayment (méthode virement/Flouci) — chantier
// portefeuille interne, brique 2/N ajoute Flouci à la brique 1/N
// (virement seul). Montant partagé entre les deux méthodes (un seul champ,
// affiché une fois) : contrôlé en state React ET présent en input caché
// dans le <form> virement (FormData a besoin de le lire), lu directement
// depuis le state pour le bouton Flouci (pas de FormData, simple appel de
// fonction — même mécanique que handleFlouci dans AcceptProposalPayment).
export function WalletDepositForm({ bankInfo }: { bankInfo: PlatformPaymentInfo | null }) {
  const [method, setMethod] = useState<'virement' | 'flouci'>('virement')
  const [amount, setAmount] = useState('')
  const [state, formAction] = useFormState(depositWalletVirement, initialState)
  const [isPending, startTransition] = useTransition()
  const [flouciError, setFlouciError] = useState<string | null>(null)

  function handleFlouci() {
    const parsed = Number(amount)
    if (!amount || !Number.isFinite(parsed) || parsed <= 0) {
      setFlouciError('Indique un montant valide.')
      return
    }
    setFlouciError(null)
    startTransition(async () => {
      const result = await initiateWalletDepositFlouci(parsed)
      // Si on arrive ici, c'est que la redirection Flouci n'a pas eu lieu.
      if (result?.error) setFlouciError(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="amount">Montant à déposer (TND)</Label>
        <Input
          id="amount"
          type="number"
          step="0.001"
          min="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          hasError={!!state.error || !!flouciError}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMethod('virement')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            method === 'virement' ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-600'
          )}
        >
          Virement
        </button>
        <button
          type="button"
          onClick={() => setMethod('flouci')}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            method === 'flouci' ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-600'
          )}
        >
          Flouci
        </button>
      </div>

      {method === 'virement' &&
        (!bankInfo ? (
          <p className="text-sm text-amber-700">Coordonnées bancaires non configurées, choisis Flouci.</p>
        ) : (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="amount" value={amount} />
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
        ))}

      {method === 'flouci' && (
        <div className="space-y-3">
          {bankInfo?.flouci_phone && (
            <p className="text-sm text-slate-600">
              <span className="text-slate-500">Numéro Flouci : </span>
              {bankInfo.flouci_phone}
            </p>
          )}
          <p className="text-xs text-slate-500">Tu seras redirigé vers Flouci pour payer par carte.</p>
          {flouciError && <ErrorText>{flouciError}</ErrorText>}
          <Button size="sm" disabled={isPending} onClick={handleFlouci}>
            {isPending ? 'Redirection…' : 'Payer avec Flouci'}
          </Button>
        </div>
      )}
    </div>
  )
}
