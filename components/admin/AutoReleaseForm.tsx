'use client'

import { useFormState } from 'react-dom'
import { updateAutoReleaseSettings, type AutoReleaseFormState } from '@/app/(admin)/admin/parametres/liberation-automatique/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: AutoReleaseFormState = { error: null, success: false }

// Même pattern que CommissionForm.tsx.
export function AutoReleaseForm({ defaultDelayDays }: { defaultDelayDays: number }) {
  const [state, formAction] = useFormState(updateAutoReleaseSettings, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="auto_release_delay_days">Délai avant libération automatique (jours)</Label>
        <Input
          id="auto_release_delay_days"
          name="auto_release_delay_days"
          type="number"
          step="1"
          min="1"
          max="90"
          defaultValue={defaultDelayDays}
          required
          hasError={!!state.error}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Si le client ne confirme jamais réception et qu&apos;aucun litige n&apos;est ouvert, les fonds
          séquestrés sont automatiquement libérés au voyageur après ce délai, décompté depuis la
          déclaration de livraison par le voyageur.
        </p>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}
      {state.success && !state.error && (
        <p className="text-sm font-medium text-brand-700">Délai mis à jour.</p>
      )}

      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  )
}
