'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { confirmReceipt } from '@/app/(client)/jibli/[id]/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Visible uniquement pour le client propriétaire, quand status='completed'
// et client_confirmed_at est vide. C'est CETTE confirmation (pas le passage
// à "completed" par le voyageur seul) qui libère les fonds séquestrés.
export function ConfirmReceiptButton({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    if (!window.confirm("Confirmer que tu as bien reçu l'objet ? Cette action libère le paiement au voyageur.")) return
    setError(null)
    startTransition(async () => {
      const result = await confirmReceipt(requestId)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div>
      <Button disabled={isPending} onClick={handleConfirm}>
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        J&apos;ai bien reçu mon colis
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
