'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { advanceRequestStatus } from '@/app/(client)/jibli/[id]/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import type { TravelRequestStatus } from '@/types/database'

export function VoyageurStatusActions({ requestId, status }: { requestId: string; status: TravelRequestStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function advance(next: 'in_transit' | 'completed') {
    setError(null)
    startTransition(async () => {
      const result = await advanceRequestStatus(requestId, next)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  if (status !== 'matched' && status !== 'in_transit') return null

  return (
    <div className="space-y-2">
      {status === 'matched' && (
        <Button disabled={isPending} onClick={() => advance('in_transit')}>
          Marquer en transit
        </Button>
      )}
      {status === 'in_transit' && (
        <Button disabled={isPending} onClick={() => advance('completed')}>
          Marquer remis au client
        </Button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
