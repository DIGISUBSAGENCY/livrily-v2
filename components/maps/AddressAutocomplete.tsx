'use client'

// Champ d'adresse avec autocomplétion Google Places, restreint à la
// Tunisie. Remonte l'adresse formatée + ses coordonnées au parent via
// onPlaceSelected — le composant ne gère pas lui-même la soumission du
// formulaire (une seule responsabilité : capturer une adresse, géolocalisée
// si possible).
//
// Fallback IMPORTANT : si NEXT_PUBLIC_GOOGLE_MAPS_API_KEY n'est pas
// configurée, on ne bloque jamais silencieusement l'utilisateur derrière un
// champ qui ne se remplit jamais — on bascule sur une saisie manuelle libre
// (lat/lng = null) avec un message explicite. Les pages qui ont vraiment
// besoin de coordonnées précises (checkout, pour le calcul de zone) doivent
// vérifier elles-mêmes place.lat/place.lng avant de laisser valider.
import { useEffect, useRef, useState } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { Input } from '@/components/ui/Input'

export interface SelectedPlace {
  address: string
  lat: number | null
  lng: number | null
}

interface AddressAutocompleteProps {
  id?: string
  defaultValue?: string
  placeholder?: string
  hasError?: boolean
  onPlaceSelected: (place: SelectedPlace) => void
}

const MAPS_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

export function AddressAutocomplete({
  id,
  defaultValue,
  placeholder = 'Tape ton adresse et choisis une suggestion',
  hasError,
  onPlaceSelected,
}: AddressAutocompleteProps) {
  const placesLib = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const [manualValue, setManualValue] = useState(defaultValue ?? '')

  // Garde toujours la dernière version du callback sans en faire une
  // dépendance de l'effet ci-dessous (qui ne doit s'exécuter qu'une fois la
  // librairie Places chargée).
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  useEffect(() => {
    onPlaceSelectedRef.current = onPlaceSelected
  }, [onPlaceSelected])

  useEffect(() => {
    if (!MAPS_CONFIGURED || !placesLib || !inputRef.current) return

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'tn' },
      fields: ['formatted_address', 'geometry'],
    })

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const location = place.geometry?.location
      if (location && place.formatted_address) {
        onPlaceSelectedRef.current({
          address: place.formatted_address,
          lat: location.lat(),
          lng: location.lng(),
        })
      }
    })

    return () => listener.remove()
  }, [placesLib])

  if (!MAPS_CONFIGURED) {
    return (
      <div>
        <Input
          id={id}
          type="text"
          placeholder="Tape ton adresse (autocomplete indisponible)"
          value={manualValue}
          onChange={(e) => {
            setManualValue(e.target.value)
            onPlaceSelectedRef.current({ address: e.target.value, lat: null, lng: null })
          }}
          hasError={hasError}
        />
        <p className="mt-1.5 text-xs text-amber-600">
          Autocomplete Google Maps indisponible (clé non configurée) — adresse saisie librement,
          sans géolocalisation précise.
        </p>
      </div>
    )
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      placeholder={placeholder}
      defaultValue={defaultValue}
      autoComplete="off"
      hasError={hasError}
      // Filet de sécurité : si l'utilisateur tape une adresse en texte libre
      // et ne clique jamais sur une suggestion Google (mobile, suggestions
      // lentes à charger, ville non reconnue...), on remonte quand même le
      // texte tapé (lat/lng = null) plutôt que de laisser le formulaire
      // bloqué indéfiniment. Un choix réel dans le dropdown déclenche ensuite
      // 'place_changed' et écrase cette valeur avec les coordonnées géocodées.
      onChange={(e) => onPlaceSelectedRef.current({ address: e.target.value, lat: null, lng: null })}
    />
  )
}
