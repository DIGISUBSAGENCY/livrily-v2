'use client'

import { useFormState } from 'react-dom'
import { updateBoostTierPrice, type BoostTierFormState } from '@/app/(admin)/admin/parametres/boost/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: BoostTierFormState = { error: null, success: false }

// Une ligne = un formulaire indépendant (son propre useFormState) plutôt
// qu'un unique formulaire à 7 champs : chaque palier s'enregistre
// séparément, sans dépendre du fait que les 6 autres champs soient valides
// — cohérent avec l'update ciblé (eq('duration_days', ...)) côté Server
// Action. .bind(null, durationDays) fige le premier argument de
// updateBoostTierPrice (signature (durationDays, prevState, formData)) :
// pattern standard Next.js pour une Server Action paramétrée utilisée avec
// useFormState, qui n'attend que (prevState, formData).
export function BoostTierRow({ durationDays, defaultPrice }: { durationDays: number; defaultPrice: number }) {
  const updateThisTier = updateBoostTierPrice.bind(null, durationDays)
  const [state, formAction] = useFormState(updateThisTier, initialState)

  return (
    <form action={formAction} className="flex items-end gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <div className="w-20 flex-shrink-0">
        <p className="text-sm font-medium text-slate-900">{durationDays} j</p>
      </div>
      <div className="flex-1">
        <Label htmlFor={`price_tnd_${durationDays}`} className="sr-only">
          Prix pour {durationDays} jour{durationDays > 1 ? 's' : ''} (TND)
        </Label>
        <Input
          id={`price_tnd_${durationDays}`}
          name="price_tnd"
          type="number"
          step="0.001"
          min="0"
          defaultValue={defaultPrice}
          required
          hasError={!!state.error}
        />
        {state.error && <ErrorText>{state.error}</ErrorText>}
        {state.success && !state.error && <p className="mt-1 text-xs font-medium text-brand-700">Enregistré.</p>}
      </div>
      <SubmitButton pendingLabel="…">Enregistrer</SubmitButton>
    </form>
  )
}
