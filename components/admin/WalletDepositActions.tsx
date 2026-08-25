'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyWalletDeposit, rejectWalletDeposit } from '@/app/(admin)/admin/portefeuille-paiements/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Mirror de WithdrawalActions (admin/retraits) — même mécanique à 2
// boutons. confirm() sur la validation seulement : c'est ici que
// wallet_balance est réellement crédité (via trigger), contrairement à
// VerifyBoostPaymentButton qui n'a pas ce garde-fou (rapprochement
// comptable sans effet sur un solde).
export function WalletDepositActions({ depositId }: { depositId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleVerify() {
    if (!window.confirm('Confirmer que ce virement a bien été reçu ? Le solde du compte sera crédité.')) return
    setError(null)
    startTransition(async () => {
      const result = await verifyWalletDeposit(depositId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleReject() {
    if (!window.confirm('Rejeter ce dépôt ? Le solde ne sera jamais crédité.')) return
    setError(null)
    startTransition(async () => {
      const result = await rejectWalletDeposit(depositId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={handleVerify}>
          Marquer vérifié
        </Button>
        <Button size="sm" variant="danger" disabled={isPending} onClick={handleReject}>
          Rejeter
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
