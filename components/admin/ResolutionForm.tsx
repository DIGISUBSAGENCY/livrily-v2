'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { Alert } from '@/components/ui/Alert'

interface ResolutionFormProps {
  // Action déjà "bindée" à son id côté appelant (resolveDispute(id, note) ou
  // resolveFlouciIncident(id, note)) — ce composant ne connaît que la
  // signature commune (note) -> résultat, partagée entre les deux features.
  onResolve: (note: string) => Promise<{ error: string | null }>
  confirmMessage: string
}

// Partagé entre /admin/litiges/[id] et /admin/flouci-incidents/[id] : dans
// les deux cas, aucune Server Action existante ne permet à un admin de
// déclencher une vraie action financière (accept_travel_proposal exige
// auth.uid() = client_id ; aucun remboursement Flouci n'est implémenté,
// l'intégration n'a d'ailleurs jamais été testée en direct, cf. lib/flouci.ts).
// La résolution est donc une DÉCISION tracée (note obligatoire + qui + quand),
// jamais une opération d'argent — l'avertissement ci-dessous est affiché de
// façon permanente, pas seulement dans une infobulle, pour qu'il n'y ait
// aucune ambiguïté pour l'admin qui utilise l'écran.
export function ResolutionForm({ onResolve, confirmMessage }: ResolutionFormProps) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (note.trim().length < 5) {
      setError('Une note est requise (5 caractères minimum) — décris la décision et ce qui a été fait, le cas échéant, en dehors de Livrily.')
      return
    }
    if (!window.confirm(`${confirmMessage}\n\nNote : ${note.trim()}`)) return

    setError(null)
    startTransition(async () => {
      const result = await onResolve(note.trim())
      if (result.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <Alert tone="warning" icon={AlertTriangle}>
        <strong>Aucune action financière automatique n&apos;est déclenchée par cette résolution.</strong> Cet
        écran enregistre une décision, pas un remboursement ni une libération de fonds. Si une action réelle
        a été menée en dehors de Livrily (remboursement manuel, contact client...), documente-la dans la note
        ci-dessous.
      </Alert>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label htmlFor="resolution_note">Note de résolution (obligatoire)</Label>
          <textarea
            id="resolution_note"
            rows={3}
            placeholder="Décision prise et, le cas échéant, action réelle effectuée en dehors de Livrily..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? 'Résolution…' : 'Marquer comme résolu'}
        </Button>
      </form>
    </div>
  )
}
