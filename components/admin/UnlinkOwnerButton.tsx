'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { unlinkCommerceOwner } from '@/app/(admin)/admin/comptes-commerce/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function UnlinkOwnerButton({ commerceId }: { commerceId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleUnlink() {
    if (!window.confirm('Délier ce compte de ce commerce ?')) return
    setError(null)
    startTransition(async () => {
      const result = await unlinkCommerceOwner(commerceId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button size="sm" variant="danger" disabled={isPending} onClick={handleUnlink}>
        Délier
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
