'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { verifyBoostPayment, rejectBoostPayment } from '@/app/(admin)/admin/boost-paiements/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Remplace VerifyBoostPaymentButton (mono-action) — chantier admin
// completeness : un virement invalide n'avait aucun chemin de résolution.
// Mirror de WalletDepositActions. confirm() sur le rejet : il RETIRE le
// temps de mise en avant déjà actif (replay, cf. schema.sql) — pas un
// simple marquage comptable comme la vérification.
export function BoostPaymentActions({ paymentId }: { paymentId: string }) {
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

  function handleReject() {
    if (!window.confirm('Rejeter cette preuve de virement ? Le temps de mise en avant correspondant sera retiré.')) return
    setError(null)
    startTransition(async () => {
      const result = await rejectBoostPayment(paymentId)
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
