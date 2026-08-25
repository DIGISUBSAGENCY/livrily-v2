'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyTravelPayment, rejectTravelPayment } from '@/app/(admin)/admin/jibli-paiements/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Remplace VerifyPaymentButton (mono-action) — chantier admin
// completeness, même trou que le Boost : une preuve invalide restait
// indéfiniment en attente. confirm() sur le rejet : le client devra
// renvoyer une preuve (Option B — la mission reste matched, cf. actions.ts).
export function TravelPaymentActions({ paymentId }: { paymentId: string }) {
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

  function handleReject() {
    if (!window.confirm('Rejeter cette preuve de virement ? Le client sera notifié et devra en renvoyer une nouvelle.')) return
    setError(null)
    startTransition(async () => {
      const result = await rejectTravelPayment(paymentId)
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
