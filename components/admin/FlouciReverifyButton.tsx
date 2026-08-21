'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { ErrorText } from '@/components/ui/ErrorText'
import { reverifyFlouciIncidentStatus } from '@/app/(admin)/admin/flouci-incidents/actions'

interface FlouciReverifyButtonProps {
  flouciPaymentId: string
}

// Pure lecture : rappelle l'API Flouci réelle (même fonction que le
// callback, verifyFlouciPayment) pour éclairer la décision de l'admin. Ne
// modifie rien en base — le résultat n'est affiché qu'à l'écran, jamais
// enregistré silencieusement.
export function FlouciReverifyButton({ flouciPaymentId }: FlouciReverifyButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: boolean; rawStatus: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      const res = await reverifyFlouciIncidentStatus(flouciPaymentId)
      if (res.error) setError(res.error)
      else setResult({ success: res.success!, rawStatus: res.rawStatus! })
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size="sm" onClick={handleClick} disabled={isPending}>
        <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden />
        {isPending ? 'Vérification…' : 'Revérifier auprès de Flouci'}
      </Button>

      {error && <ErrorText>{error}</ErrorText>}

      {result && (
        <Alert tone={result.success ? 'success' : 'danger'}>
          Statut réel Flouci actuel : <strong>{result.rawStatus}</strong>
          {result.success ? ' (paiement confirmé réussi côté Flouci).' : ' (non confirmé réussi côté Flouci en ce moment).'}
        </Alert>
      )}
    </div>
  )
}
