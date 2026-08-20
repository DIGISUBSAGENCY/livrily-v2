'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { openDispute } from '@/app/(client)/jibli/[id]/actions'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState = { error: null, success: false }

export function DisputeForm({ requestId }: { requestId: string }) {
  const action = openDispute.bind(null, requestId)
  const [state, formAction] = useFormState(action, initialState)
  const [expanded, setExpanded] = useState(false)

  if (state.success) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
        Litige envoyé — un admin va l&apos;examiner. Suivi sur{' '}
        <a href="/profil/litiges" className="font-medium text-brand-600 hover:underline">
          Mes litiges
        </a>
        .
      </p>
    )
  }

  if (!expanded) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
        <AlertTriangle className="h-4 w-4" aria-hidden />
        Signaler un litige
      </Button>
    )
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <Label htmlFor="reason">Décris le problème</Label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          required
          minLength={10}
          placeholder="Ex : objet non conforme, livraison non effectuée, désaccord sur le montant…"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <div className="flex gap-2">
        <SubmitButton size="sm" pendingLabel="Envoi…">
          Envoyer le litige
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
