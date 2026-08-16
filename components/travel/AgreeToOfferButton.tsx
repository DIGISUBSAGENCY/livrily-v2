'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { agreeToCurrentOffer } from '@/app/(client)/jibli/[id]/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Acceptation côté VOYAGEUR : ne déplace aucun argent (seul le client paie),
// verrouille juste les termes — cf. agree_to_current_offer côté base.
export function AgreeToOfferButton({ requestId, proposalId }: { requestId: string; proposalId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAgree() {
    setError(null)
    startTransition(async () => {
      const result = await agreeToCurrentOffer(requestId, proposalId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button size="sm" disabled={isPending} onClick={handleAgree}>
        Accepter cette offre
      </Button>
      <p className="mt-1 text-xs text-slate-500">
        Verrouille ce montant — le client devra ensuite payer pour conclure.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
