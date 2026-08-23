'use client'

import { useFormState } from 'react-dom'
import { createProductOffer, type ProductOfferFormState } from '@/app/(client)/jibli/offres/nouveau/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ProductOfferFormState = { error: null }

export function ProductOfferForm() {
  const [state, formAction] = useFormState(createProductOffer, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="item_description">Description du produit</Label>
        <textarea
          id="item_description"
          name="item_description"
          rows={3}
          required
          placeholder="Ex : iPhone 16, 128 Go, noir, neuf sous blister"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <Label htmlFor="item_photo">Photo du produit (optionnel)</Label>
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

      <div>
        <Label htmlFor="travel_date">Date de disponibilité</Label>
        <Input id="travel_date" name="travel_date" type="date" required hasError={!!state.error} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="item_price">Prix du produit (DT)</Label>
          <Input id="item_price" name="item_price" type="number" step="0.001" min="0" required hasError={!!state.error} />
          <p className="mt-1.5 text-xs text-slate-500">Ce que le client te rembourse pour l&apos;objet.</p>
        </div>
        <div>
          <Label htmlFor="delivery_fee">Frais de service (DT)</Label>
          <Input id="delivery_fee" name="delivery_fee" type="number" step="0.001" min="0" required hasError={!!state.error} />
          <p className="mt-1.5 text-xs text-slate-500">Ta rémunération pour le trajet.</p>
        </div>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Publication…">
        Publier l&apos;offre
      </SubmitButton>
    </form>
  )
}
