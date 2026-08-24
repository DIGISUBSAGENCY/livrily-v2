'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyBoostPayment } from '@/app/(admin)/admin/boost-paiements/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Mirror de VerifyPaymentButton (jibli-paiements) — même mécanique, autre
// action déléguée.
export function VerifyBoostPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleVerify() {
    setError(null)
    startTransition(async () => {
      const result = await verifyBoostPayment(paymentId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button size="sm" disabled={isPending} onClick={handleVerify}>
        Marquer vérifié
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
