'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelProductOffer } from '@/app/(client)/jibli/offres/[id]/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function CancelOfferButton({ offerId }: { offerId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    if (!window.confirm('Annuler cette offre ?')) return
    setError(null)
    startTransition(async () => {
      const result = await cancelProductOffer(offerId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button size="sm" variant="danger" disabled={isPending} onClick={handleCancel}>
        Annuler mon offre
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
