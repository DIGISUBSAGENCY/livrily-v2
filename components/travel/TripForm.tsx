'use client'

import { useFormState } from 'react-dom'
import { createTrip, type TripFormState } from '@/app/(client)/jibli/trips/nouveau/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: TripFormState = { error: null }

export function TripForm() {
  const [state, formAction] = useFormState(createTrip, initialState)

  return (
    <form action={formAction} className="space-y-4">
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

      <div>
        <Label htmlFor="pickup_city">Ville de départ (optionnel)</Label>
        <Input id="pickup_city" name="pickup_city" placeholder="Lyon" hasError={!!state.error} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="travel_date">Date de voyage</Label>
          <Input id="travel_date" name="travel_date" type="date" required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="available_weight_kg">Poids disponible (kg)</Label>
          <Input
            id="available_weight_kg"
            name="available_weight_kg"
            type="number"
            step="0.1"
            min="0.1"
            required
            hasError={!!state.error}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="indicative_price">Prix indicatif, DT (optionnel)</Label>
        <Input id="indicative_price" name="indicative_price" type="number" step="0.001" min="0" hasError={!!state.error} />
        <p className="mt-1.5 text-xs text-slate-500">
          Juste une indication de départ — le prix final se négocie une fois en contact avec un client.
        </p>
      </div>

      <div>
        <Label htmlFor="message">Message (optionnel)</Label>
        <textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Ex : je fais ce trajet toutes les 2 semaines, contactez-moi pour les détails."
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Publication…">
        Publier le trip
      </SubmitButton>
    </form>
  )
}
