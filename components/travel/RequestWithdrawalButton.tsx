'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestWithdrawal } from '@/app/(client)/jibli/mes-gains/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function RequestWithdrawalButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      const result = await requestWithdrawal()
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button disabled={isPending} onClick={handleRequest}>
        Demander un retrait
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
