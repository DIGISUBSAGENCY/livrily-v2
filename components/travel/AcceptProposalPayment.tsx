'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import { acceptProposalVirement, initiateFlouciPayment, type ActionResult } from '@/app/(client)/jibli/[id]/actions'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { BankTransferInfo } from '@/types/database'
import { FileInput } from '@/components/ui/FileInput'
import { PaymentMethodToggle } from '@/components/ui/PaymentMethodToggle'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib' | 'flouci_phone'>

interface AcceptProposalPaymentProps {
  requestId: string
  proposalId: string
  bankInfo: PlatformPaymentInfo | null
}

const initialState: ActionResult = { error: null }

// Étape de paiement affichée quand le client clique "Accepter" sur une
// proposition. Deux mécaniques différentes derrière un choix qui a l'air
// symétrique (voir accept_travel_proposal côté base) :
//   - virement : upload de preuve, appelle la Server Action tout de suite —
//     le paiement reste "awaiting_verification" jusqu'à validation admin.
//   - Flouci : redirige vers un vrai paiement carte, rien n'est écrit en
//     base tant que le paiement n'est pas confirmé par le callback.
export function AcceptProposalPayment({ requestId, proposalId, bankInfo }: AcceptProposalPaymentProps) {
  const [expanded, setExpanded] = useState(false)
  const [method, setMethod] = useState<'virement' | 'flouci'>('virement')
  const virementAction = acceptProposalVirement.bind(null, requestId, proposalId)
  const [virementState, virementFormAction] = useFormState(virementAction, initialState)
  const [isPending, startTransition] = useTransition()
  const [flouciError, setFlouciError] = useState<string | null>(null)

  function handleFlouci() {
    setFlouciError(null)
    startTransition(async () => {
      const result = await initiateFlouciPayment(requestId, proposalId)
      // Si on arrive ici, c'est que la redirection Flouci n'a pas eu lieu.
      if (result?.error) setFlouciError(result.error)
    })
  }

  if (!expanded) {
    return (
      <Button size="sm" onClick={() => setExpanded(true)}>
        Accepter cette proposition
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <PaymentMethodToggle method={method} onChange={setMethod} />

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
              <FileInput id="payment_proof" name="payment_proof" required />
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
