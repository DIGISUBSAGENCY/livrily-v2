'use client'

import { useFormState } from 'react-dom'
import { createTravelRequest, type TravelRequestFormState } from '@/app/(client)/jibli/nouvelle-demande/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: TravelRequestFormState = { error: null }

export function RequestForm() {
  const [state, formAction] = useFormState(createTravelRequest, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="item_description">Description de l&apos;objet</Label>
        <textarea
          id="item_description"
          name="item_description"
          rows={3}
          required
          placeholder="Ex : une paire de baskets Nike Air Max, taille 42, modèle noir/blanc"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <Label htmlFor="item_url">Lien vers l&apos;objet (optionnel)</Label>
        <Input id="item_url" name="item_url" type="url" placeholder="https://…" hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="item_photo">Photo de l&apos;objet (optionnel)</Label>
        <input
          id="item_photo"
          name="item_photo"
          type="file"
          accept="image/*"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="origin_country">Pays d&apos;origine</Label>
          <Input id="origin_country" name="origin_country" placeholder="France" required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="destination_city">Ville de destination</Label>
          <Input id="destination_city" name="destination_city" placeholder="Tunis" required hasError={!!state.error} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="budget_max">Budget max (DT)</Label>
          <Input
            id="budget_max"
            name="budget_max"
            type="number"
            step="0.001"
            min="0"
            required
            hasError={!!state.error}
          />
        </div>
        <div>
          <Label htmlFor="needed_by">Date limite souhaitée (optionnel)</Label>
          <Input id="needed_by" name="needed_by" type="date" />
        </div>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Publication…">
        Publier la demande
      </SubmitButton>
    </form>
  )
}
