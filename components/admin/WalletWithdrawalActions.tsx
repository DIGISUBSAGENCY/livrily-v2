'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { payWalletWithdrawal, rejectWalletWithdrawal } from '@/app/(admin)/admin/portefeuille-retraits/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Mirror exact de WithdrawalActions (/admin/retraits).
export function WalletWithdrawalActions({ withdrawalId }: { withdrawalId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handlePay() {
    if (!window.confirm('Confirmer que le virement a bien été effectué ?')) return
    setError(null)
    startTransition(async () => {
      const result = await payWalletWithdrawal(withdrawalId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleReject() {
    if (!window.confirm('Rejeter cette demande de retrait ? Le montant redevient disponible pour l\'utilisateur.')) return
    setError(null)
    startTransition(async () => {
      const result = await rejectWalletWithdrawal(withdrawalId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={handlePay}>
          Marquer payé
        </Button>
        <Button size="sm" variant="danger" disabled={isPending} onClick={handleReject}>
          Rejeter
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
