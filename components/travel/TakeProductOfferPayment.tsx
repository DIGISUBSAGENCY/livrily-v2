'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import {
  takeProductOfferVirement,
  takeProductOfferFlouci,
  type ProductOfferActionState,
} from '@/app/(client)/jibli/offres/[id]/actions'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { cn } from '@/lib/utils'
import type { BankTransferInfo } from '@/types/database'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib' | 'flouci_phone'>

interface TakeProductOfferPaymentProps {
  offerId: string
  bankInfo: PlatformPaymentInfo | null
}

const initialState: ProductOfferActionState = { error: null }

// Mirror de AcceptProposalPayment — même choix virement/Flouci, mêmes deux
// mécaniques (cf. commentaires là-bas). Différence : pas de "proposition à
// accepter" pré-existante ici, prendre l'offre EST l'action (take_product_offer
// + accept_travel_proposal en un clic, cf. actions.ts) — pas de bouton
// "Accepter" à replier avant, le choix de paiement est la première chose
// affichée.
export function TakeProductOfferPayment({ offerId, bankInfo }: TakeProductOfferPaymentProps) {
  const [method, setMethod] = useState<'virement' | 'flouci'>('virement')
  const virementAction = takeProductOfferVirement.bind(null, offerId)
  const [virementState, virementFormAction] = useFormState(virementAction, initialState)
  const [isPending, startTransition] = useTransition()
  const [flouciError, setFlouciError] = useState<string | null>(null)

  function handleFlouci() {
    setFlouciError(null)
    startTransition(async () => {
      const result = await takeProductOfferFlouci(offerId)
      // Si on arrive ici, c'est que la redirection Flouci n'a pas eu lieu.
      if (result?.error) setFlouciError(result.error)
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
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
          <form action={virementFormAction} className="space-y-3">
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
            {virementState.error && <ErrorText>{virementState.error}</ErrorText>}
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
