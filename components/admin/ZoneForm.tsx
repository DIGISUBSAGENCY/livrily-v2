'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { AddressAutocomplete, type SelectedPlace } from '@/components/maps/AddressAutocomplete'
import type { DeliveryZone } from '@/types/database'

interface ZoneFormState {
  error: string | null
}

interface ZoneFormProps {
  action: (prevState: ZoneFormState, formData: FormData) => Promise<ZoneFormState>
  zone?: DeliveryZone
  submitLabel: string
}

const initialState: ZoneFormState = { error: null }

export function ZoneForm({ action, zone, submitLabel }: ZoneFormProps) {
  const [state, formAction] = useFormState(action, initialState)
  // Latitude/longitude toujours saisissables à la main (pas seulement via
  // l'autocomplete) : sans clé Google Maps configurée, l'autocomplete
  // bascule en saisie libre sans coordonnées (cf. AddressAutocomplete) — une
  // zone sans coordonnées est inutilisable, donc pas question de bloquer le
  // formulaire derrière la seule disponibilité de la clé (même piège que
  // /profil/completer, déjà corrigé ailleurs).
  const [lat, setLat] = useState(zone?.center_lat?.toString() ?? '')
  const [lng, setLng] = useState(zone?.center_lng?.toString() ?? '')

  function handlePlaceSelected(place: SelectedPlace) {
    if (place.lat != null) setLat(place.lat.toString())
    if (place.lng != null) setLng(place.lng.toString())
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="name">Nom de la zone</Label>
        <Input id="name" name="name" defaultValue={zone?.name} required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="city">Ville (optionnel)</Label>
        <Input id="city" name="city" defaultValue={zone?.city ?? ''} />
      </div>

      <div>
        <Label htmlFor="center">Rechercher une adresse (optionnel, pré-remplit les coordonnées)</Label>
        <AddressAutocomplete id="center" onPlaceSelected={handlePlaceSelected} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="center_lat">Latitude</Label>
          <Input
            id="center_lat"
            name="center_lat"
            type="number"
            step="any"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required
            hasError={!!state.error}
          />
        </div>
        <div>
          <Label htmlFor="center_lng">Longitude</Label>
          <Input
            id="center_lng"
            name="center_lng"
            type="number"
            step="any"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            required
            hasError={!!state.error}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="radius_meters">Rayon (mètres)</Label>
          <Input
            id="radius_meters"
            name="radius_meters"
            type="number"
            min="1"
            step="1"
            defaultValue={zone?.radius_meters}
            required
            hasError={!!state.error}
          />
        </div>
        <div>
          <Label htmlFor="delivery_fee">Frais de base (DT)</Label>
          <Input
            id="delivery_fee"
            name="delivery_fee"
            type="number"
            step="0.001"
            min="0"
            defaultValue={zone?.delivery_fee}
            required
            hasError={!!state.error}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="fee_per_km">Frais au km (DT)</Label>
        <Input
          id="fee_per_km"
          name="fee_per_km"
          type="number"
          step="0.001"
          min="0"
          defaultValue={zone?.fee_per_km ?? 0}
          required
          hasError={!!state.error}
        />
        <p className="mt-1 text-xs text-slate-500">
          Frais final = frais de base + (frais au km × distance réelle commerce → client).
        </p>
      </div>

      <div>
        <Label htmlFor="min_order_amount">Commande minimum (DT)</Label>
        <Input
          id="min_order_amount"
          name="min_order_amount"
          type="number"
          step="0.001"
          min="0"
          defaultValue={zone?.min_order_amount ?? 0}
          required
          hasError={!!state.error}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={zone?.is_active ?? true}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Zone active
      </label>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton disabled={!lat || !lng}>{submitLabel}</SubmitButton>
    </form>
  )
}
