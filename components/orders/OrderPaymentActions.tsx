'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyOrderPayment, rejectOrderPayment } from '@/app/(admin)/admin/paiements/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function OrderPaymentActions({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleVerify() {
    setError(null)
    startTransition(async () => {
      const result = await verifyOrderPayment(orderId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleReject() {
    if (!window.confirm('Rejeter ce paiement ? Le client devra renvoyer une preuve.')) return
    setError(null)
    startTransition(async () => {
      const result = await rejectOrderPayment(orderId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={handleVerify}>
          Valider le paiement
        </Button>
        <Button size="sm" variant="danger" disabled={isPending} onClick={handleReject}>
          Rejeter
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
