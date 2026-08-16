'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelRequest } from '@/app/(client)/jibli/[id]/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    if (!window.confirm('Annuler cette demande ?')) return
    setError(null)
    startTransition(async () => {
      const result = await cancelRequest(requestId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button size="sm" variant="danger" disabled={isPending} onClick={handleCancel}>
        Annuler ma demande
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
