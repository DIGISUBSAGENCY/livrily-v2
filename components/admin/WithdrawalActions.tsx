'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { payWithdrawal, rejectWithdrawal } from '@/app/(admin)/admin/retraits/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function WithdrawalActions({ withdrawalId }: { withdrawalId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handlePay() {
    if (!window.confirm('Confirmer que le virement a bien été effectué au voyageur ?')) return
    setError(null)
    startTransition(async () => {
      const result = await payWithdrawal(withdrawalId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleReject() {
    if (!window.confirm('Rejeter cette demande de retrait ? Le montant redevient disponible pour le voyageur.')) return
    setError(null)
    startTransition(async () => {
      const result = await rejectWithdrawal(withdrawalId)
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
