'use client'

import { useFormState } from 'react-dom'
import { updateCommissionSettings, type CommissionFormState } from '@/app/(admin)/admin/parametres/commission/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: CommissionFormState = { error: null, success: false }

// defaultRatePercent : la fraction stockée en base (ex: 0.10) convertie en
// pourcentage humain (10) pour l'affichage/saisie — reconverti en fraction
// côté Server Action (lib/validations/settings.ts).
export function CommissionForm({ defaultRatePercent }: { defaultRatePercent: number }) {
  const [state, formAction] = useFormState(updateCommissionSettings, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="travel_commission_rate">Taux de commission Livrily (%)</Label>
        <Input
          id="travel_commission_rate"
          name="travel_commission_rate"
          type="number"
          step="0.01"
          min="0"
          max="100"
          defaultValue={defaultRatePercent}
          required
          hasError={!!state.error}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Appliqué uniquement sur les frais de livraison des opérations Livrily (livraison entre
          particuliers), jamais sur le prix de l&apos;objet remboursé au voyageur.
        </p>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}
      {state.success && !state.error && (
        <p className="text-sm font-medium text-brand-700">Taux de commission mis à jour.</p>
      )}

      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  )
}
