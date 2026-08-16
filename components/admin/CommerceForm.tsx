'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { AddressAutocomplete, type SelectedPlace } from '@/components/maps/AddressAutocomplete'
import type { Commerce, CommerceCategory, DeliveryZone } from '@/types/database'

interface CommerceFormState {
  error: string | null
}

interface CommerceFormProps {
  action: (prevState: CommerceFormState, formData: FormData) => Promise<CommerceFormState>
  commerce?: Commerce
  zones: DeliveryZone[]
  submitLabel: string
}

const initialState: CommerceFormState = { error: null }

const categoryLabels: Record<CommerceCategory, string> = {
  supermarche: 'Supermarché',
  boulangerie: 'Boulangerie',
  fruits_legumes: 'Fruits & légumes',
  pharmacie: 'Pharmacie',
}

export function CommerceForm({ action, commerce, zones, submitLabel }: CommerceFormProps) {
  const [state, formAction] = useFormState(action, initialState)
  // Lat/lng toujours saisissables à la main, même raison que ZoneForm : sans
  // clé Google Maps, l'autocomplete ne renvoie pas de coordonnées.
  const [lat, setLat] = useState(commerce?.lat?.toString() ?? '')
  const [lng, setLng] = useState(commerce?.lng?.toString() ?? '')
  const [address, setAddress] = useState(commerce?.address ?? '')

  function handlePlaceSelected(place: SelectedPlace) {
    setAddress(place.address)
    if (place.lat != null) setLat(place.lat.toString())
    if (place.lng != null) setLng(place.lng.toString())
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="name">Nom du commerce</Label>
        <Input id="name" name="name" defaultValue={commerce?.name} required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="category">Catégorie</Label>
        <select
          id="category"
          name="category"
          defaultValue={commerce?.category ?? 'supermarche'}
          required
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="description">Description (optionnel)</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={commerce?.description ?? ''}
          rows={3}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <Label htmlFor="address_search">Adresse</Label>
        <AddressAutocomplete id="address_search" defaultValue={address} onPlaceSelected={handlePlaceSelected} />
        {address && <p className="mt-1.5 text-xs text-slate-500">Adresse retenue : {address}</p>}
        <input type="hidden" name="address" value={address} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="lat">Latitude</Label>
          <Input id="lat" name="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="lng">Longitude</Label>
          <Input id="lng" name="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
        </div>
      </div>

      <div>
        <Label htmlFor="zone_id">Zone de livraison</Label>
        <select
          id="zone_id"
          name="zone_id"
          defaultValue={commerce?.zone_id ?? ''}
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Aucune (checkout indisponible tant que non définie)</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="phone">Téléphone (optionnel)</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={commerce?.phone ?? ''} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={commerce?.is_active ?? true}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Commerce actif (visible des clients)
      </label>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}
