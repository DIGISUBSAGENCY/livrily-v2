'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveVerification, rejectVerification } from '@/app/(admin)/admin/verifications/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function VerificationActions({ verificationId }: { verificationId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleApprove() {
    if (!window.confirm("Confirmer que le document et le selfie correspondent bien à cette personne ?")) return
    setError(null)
    startTransition(async () => {
      const result = await approveVerification(verificationId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleReject() {
    const reason = window.prompt('Raison du refus (visible par le client) :')
    if (reason === null) return
    if (!reason.trim()) {
      setError('Une raison est requise pour rejeter une vérification.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await rejectVerification(verificationId, reason)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={handleApprove}>
          Approuver
        </Button>
        <Button size="sm" variant="danger" disabled={isPending} onClick={handleReject}>
          Rejeter
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
