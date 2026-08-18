'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { updateProfile, type ProfileFormState } from '@/app/profil/completer/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { AddressAutocomplete, type SelectedPlace } from '@/components/maps/AddressAutocomplete'
import { COUNTRIES } from '@/lib/constants/countries'

const initialState: ProfileFormState = { error: null }

interface ProfileFormProps {
  defaultFullName?: string
  defaultCountry?: string
  defaultProfession?: string
}

export function ProfileForm({
  defaultFullName = '',
  defaultCountry = 'TN',
  defaultProfession = '',
}: ProfileFormProps) {
  const [state, formAction] = useFormState(updateProfile, initialState)
  const [place, setPlace] = useState<SelectedPlace | null>(null)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="full_name">Nom complet</Label>
        <Input id="full_name" name="full_name" type="text" defaultValue={defaultFullName} required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="phone">Téléphone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="20123456"
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="country">Pays</Label>
        <Select id="country" name="country" defaultValue={defaultCountry} required hasError={!!state.error}>
          {COUNTRIES.map((country) => (
            <option key={country.value} value={country.value}>
              {country.label}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="profession">Profession / Métier (optionnel)</Label>
        <Input
          id="profession"
          name="profession"
          type="text"
          placeholder="Ingénieur, Étudiant, Commerçant…"
          defaultValue={defaultProfession}
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="address">Adresse de livraison</Label>
        <AddressAutocomplete id="address" onPlaceSelected={setPlace} hasError={!!state.error} />
        {place && place.lat != null && (
          <p className="mt-1.5 text-xs text-slate-500">Adresse localisée : {place.address}</p>
        )}
        {/* Champs réellement envoyés au Server Action : uniquement une fois
            qu'une suggestion Google Places a été sélectionnée (donc géocodée). */}
        <input type="hidden" name="address" value={place?.address ?? ''} />
        <input type="hidden" name="address_lat" value={place?.lat ?? ''} />
        <input type="hidden" name="address_lng" value={place?.lng ?? ''} />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Enregistrement…" disabled={!place?.address}>
        Continuer
      </SubmitButton>
    </form>
  )
}
