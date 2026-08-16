'use client'

import { useFormState } from 'react-dom'
import { createSurgeRule, type SurgeRuleFormState } from '@/app/(admin)/admin/zones/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const initialState: SurgeRuleFormState = { error: null }

export function SurgeRuleForm({ zoneId }: { zoneId: string }) {
  const createSurgeRuleWithZone = createSurgeRule.bind(null, zoneId)
  const [state, formAction] = useFormState(createSurgeRuleWithZone, initialState)

  return (
    <form
      // Remonte (donc réinitialise les champs non contrôlés) à chaque
      // nouvelle référence de state — c'est-à-dire à chaque soumission
      // réussie, y compris répétée (revalidatePath ne change pas la route).
      key={JSON.stringify(state)}
      action={formAction}
      className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="surge_label">Nom</Label>
          <Input id="surge_label" name="label" placeholder="Heure de pointe midi" required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="surge_multiplier">Multiplicateur</Label>
          <Input
            id="surge_multiplier"
            name="multiplier"
            type="number"
            step="0.05"
            min="1.01"
            placeholder="1.20"
            required
            hasError={!!state.error}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="surge_start">Début</Label>
          <Input id="surge_start" name="start_time" type="time" required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="surge_end">Fin</Label>
          <Input id="surge_end" name="end_time" type="time" required hasError={!!state.error} />
        </div>
      </div>

      <div>
        <Label>Jours</Label>
        <div className="flex flex-wrap gap-2">
          {dayLabels.map((label, index) => (
            <label key={index} className="flex items-center gap-1 text-sm text-slate-700">
              <input
                type="checkbox"
                name="days_of_week"
                value={index}
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton>Ajouter la règle</SubmitButton>
    </form>
  )
}
