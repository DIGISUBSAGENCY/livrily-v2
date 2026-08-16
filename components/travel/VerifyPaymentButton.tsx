'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyTravelPayment } from '@/app/(admin)/admin/jibli-paiements/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function VerifyPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleVerify() {
    setError(null)
    startTransition(async () => {
      const result = await verifyTravelPayment(paymentId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button size="sm" disabled={isPending} onClick={handleVerify}>
        Valider le paiement
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
