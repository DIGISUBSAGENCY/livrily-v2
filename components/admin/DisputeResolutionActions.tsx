'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Undo2, XCircle } from 'lucide-react'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { Alert } from '@/components/ui/Alert'

interface ActionResult {
  error: string | null
}

interface DisputeResolutionActionsProps {
  onReleaseFunds: (note: string) => Promise<ActionResult>
  onRefund: (note: string) => Promise<ActionResult>
  onClose: (note: string) => Promise<ActionResult>
}

// Remplace ResolutionForm (composant partagé décision-seule, resté tel
// quel et toujours utilisé par /admin/flouci-incidents) pour ce cas précis :
// contrairement à flouci-incidents, une résolution de litige a maintenant
// 3 issues réellement différentes — dont une (libérer les fonds) est une
// vraie action financière automatisée, pas une simple décision tracée. Le
// bandeau générique "aucune action financière automatique n'est
// déclenchée" de ResolutionForm serait donc FAUX ici pour ce bouton
// précis — d'où un composant dédié avec un avertissement différent par
// action plutôt qu'un message unique.
export function DisputeResolutionActions({ onReleaseFunds, onRefund, onClose }: DisputeResolutionActionsProps) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'release' | 'refund' | 'close' | null>(null)

  function run(action: 'release' | 'refund' | 'close', confirmMessage: string, call: (note: string) => Promise<ActionResult>) {
    const trimmed = note.trim()
    if (trimmed.length < 5) {
      setError('Une note de résolution est requise (5 caractères minimum) avant toute action.')
      return
    }
    if (!window.confirm(`${confirmMessage}\n\nNote : ${trimmed}`)) return

    setError(null)
    setPendingAction(action)
    startTransition(async () => {
      const result = await call(trimmed)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="dispute_resolution_note">Note de résolution (obligatoire, partagée par les 3 actions)</Label>
        <textarea
          id="dispute_resolution_note"
          rows={3}
          placeholder="Explique la décision — pour un remboursement manuel, précise comment il a été effectué (virement, référence...)."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="space-y-3">
        <Alert tone="success">
          <p className="font-semibold">Libérer les fonds au voyageur</p>
          <p className="mt-1">
            Action réelle et immédiate : débloque le paiement séquestré (comme si le client avait confirmé
            réception). Le voyageur peut ensuite le retirer.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            disabled={isPending}
            onClick={() =>
              run('release', 'Confirmer la libération des fonds au voyageur ? Action réelle et irréversible.', onReleaseFunds)
            }
          >
            <Wallet className="h-4 w-4" aria-hidden />
            {isPending && pendingAction === 'release' ? 'Libération…' : 'Libérer les fonds'}
          </Button>
        </Alert>

        <Alert tone="warning">
          <p className="font-semibold">Marquer comme remboursé manuellement</p>
          <p className="mt-1">
            <strong>N&apos;effectue AUCUN remboursement réel</strong> — aucun mécanisme de remboursement
            automatique n&apos;existe dans Livrily. À utiliser uniquement après avoir déjà remboursé le client
            toi-même, en dehors de la plateforme (virement, espèces...). Cette action enregistre seulement que
            c&apos;est fait.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={isPending}
            onClick={() =>
              run(
                'refund',
                "Confirmes-tu avoir déjà remboursé le client manuellement, en dehors de Livrily ? Cette action n'effectue aucun remboursement — elle enregistre seulement que c'est fait.",
                onRefund
              )
            }
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            {isPending && pendingAction === 'refund' ? 'Enregistrement…' : 'Marquer comme remboursé manuellement'}
          </Button>
        </Alert>

        <Alert tone="neutral">
          <p className="font-semibold">Clôturer sans action</p>
          <p className="mt-1">Litige non fondé ou déjà réglé autrement — aucune action financière.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            disabled={isPending}
            onClick={() => run('close', 'Clôturer ce litige sans action financière ?', onClose)}
          >
            <XCircle className="h-4 w-4" aria-hidden />
            {isPending && pendingAction === 'close' ? 'Clôture…' : 'Clôturer sans action'}
          </Button>
        </Alert>
      </div>
    </div>
  )
}
