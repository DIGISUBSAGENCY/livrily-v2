'use client'

import { Map, Marker } from '@vis.gl/react-google-maps'
import type { CountryFlowRow } from '@/lib/countryGeo'

const MAPS_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)

interface CountryFlowMapProps {
  rows: CountryFlowRow[]
}

// Réutilise l'infra Google Maps déjà en place dans ce projet
// (GoogleMapsProvider, monté globalement dans app/layout.tsx — cf.
// AddressAutocomplete.tsx) plutôt que d'ajouter une nouvelle dépendance
// cartographique. Marker "classique" (pas AdvancedMarker) : pas besoin
// d'un mapId configuré dans la Google Cloud Console pour ça, contrairement
// à AdvancedMarker.
//
// MAPS_CONFIGURED : même garde-fou qu'AddressAutocomplete — si la clé
// n'est pas configurée (dev sans .env complet, par ex.), on ne rend rien
// ici plutôt que de laisser la lib planter silencieusement sans contexte
// APIProvider. Le repli textuel (liste sous la carte, cf.
// CountryFlowSection.tsx) reste toujours affiché dans tous les cas.
export function CountryFlowMap({ rows }: CountryFlowMapProps) {
  const geoRows = rows.filter((r) => r.lat !== null && r.lng !== null)

  if (!MAPS_CONFIGURED) return null
  if (geoRows.length === 0) return null

  return (
    <Map
      // La hauteur DOIT passer par className, pas par style : le composant
      // Map de @vis.gl/react-google-maps ignore totalement `style` dès
      // qu'un `className` est aussi fourni (`style: className ? undefined
      // : combinedStyle` dans sa source) — trouvé en creusant pourquoi la
      // carte restait invisible malgré un SDK chargé avec succès (le
      // conteneur se retrouvait sans hauteur du tout, silencieusement).
      className="relative h-80 w-full overflow-hidden rounded-lg border border-slate-200"
      defaultCenter={{ lat: 30, lng: 20 }}
      defaultZoom={2}
      gestureHandling="cooperative"
      disableDefaultUI
      zoomControl
    >
      {geoRows.map((row) => (
        <Marker
          key={row.label}
          position={{ lat: row.lat as number, lng: row.lng as number }}
          title={`${row.label} — ${row.count} annonce${row.count > 1 ? 's' : ''}`}
          label={{ text: String(row.count), color: '#ffffff', fontWeight: 'bold', fontSize: '11px' }}
        />
      ))}
    </Map>
  )
}
