'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CountryFlowRow } from '@/lib/countryGeo'

interface CountryFlowMapProps {
  rows: CountryFlowRow[]
  // Total affiché sur le marqueur hub Tunisie (déjà calculé côté appelant,
  // cf. CountryFlowSection.tsx — pas recalculé ici).
  totalCount: number
}

const TUNISIA: [number, number] = [34.0, 9.6]

// Tuiles CartoDB light_nolabels — fond épuré (pas de labels de villes
// secondaires) sans avoir à gérer un style JSON custom. Attribution
// CARTO + OpenStreetMap obligatoire par leur licence, jamais omise (passée
// à TileLayer, affichée par le contrôle d'attribution par défaut de
// Leaflet, toujours actif sauf désactivation explicite qu'on ne fait pas
// ici).
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'

// DivIcon = HTML brut injecté par Leaflet hors de l'arbre React — les
// classes Tailwind s'appliquent quand même (la feuille de style compilée
// est globale, pas liée au rendu React). animate-ping = animation Tailwind
// native pour le halo pulsant, pas de CSS custom nécessaire pour ça. Pas de
// chiffre sur ce point (contrairement au hub Tunisie, cf. hubDivIcon) —
// juste le halo, le compte par pays vit déjà dans les pills sous la carte
// (cf. CountryFlowSection.tsx), pas la peine de le répéter sur un cercle de
// 16px.
function countryDivIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <span class="relative flex h-4 w-4">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75"></span>
        <span class="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 ring-2 ring-white"></span>
      </span>
    `,
    className: '', // vide : sans ça Leaflet ajoute sa propre classe par défaut (fond blanc, bordure) par-dessus notre HTML
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

// Hub Tunisie : même traitement mais plus grand, avec le badge du total —
// interpolé directement dans le HTML (re-généré si totalCount change).
function hubDivIcon(totalCount: number): L.DivIcon {
  return L.divIcon({
    html: `
      <span class="relative flex h-11 w-11 items-center justify-center">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60"></span>
        <span class="relative flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white ring-4 ring-white shadow-soft-lg">
          ${totalCount}
        </span>
      </span>
    `,
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  })
}

// Flèche animée par pays (point 2, chantier améliorations carte) — pas de
// nouvelle dépendance (leaflet-polylinedecorator écarté, cf. proposition
// validée : l'animation reste de toute façon à coder à la main dans les
// deux cas, autant éviter une lib de plus sans types officiels). Interpole
// linéairement la position entre l'origine et Tunisie via
// requestAnimationFrame, en écrivant directement sur l'instance Leaflet
// (marker.setLatLng) — jamais via un état React, qui déclencherait un
// re-render à chaque frame (coûteux avec plusieurs pays affichés à la
// fois).
const ARROW_CYCLE_MS = 2600

function bearingDegrees(originLat: number, originLng: number, destLat: number, destLng: number): number {
  // atan2(Δlng, Δlat) : 0° = vers le haut (nord), sens horaire — correspond
  // directement à une rotation CSS classique (transform: rotate()).
  // Approximation planaire, cohérente avec la ligne droite du Polyline
  // ci-dessous (pas un vrai calcul géodésique, volontairement, même
  // simplification que la ligne elle-même).
  return (Math.atan2(destLng - originLng, destLat - originLat) * 180) / Math.PI
}

function arrowDivIcon(bearingDeg: number): L.DivIcon {
  return L.divIcon({
    html: `
      <span class="block h-2.5 w-2.5" style="transform: rotate(${bearingDeg}deg)">
        <svg viewBox="0 0 10 10" class="h-full w-full fill-brand-700 drop-shadow-sm"><path d="M5 0 L10 10 L5 7 L0 10 Z" /></svg>
      </span>
    `,
    className: '',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

interface AnimatedFlowArrowProps {
  originLat: number
  originLng: number
}

// Un composant dédié PAR pays (clé = row.label côté appelant) plutôt qu'une
// boucle d'animation centralisée dans CountryFlowMap : au changement
// d'onglet Articles/Demandes, CountryFlowMap n'est PAS démonté (seules ses
// props rows/totalCount changent, cf. CountryFlowSection.tsx) — sans clé
// par pays, les boucles requestAnimationFrame des pays disparus
// continueraient de tourner indéfiniment (fuite). En donnant à chaque
// flèche sa propre clé et son propre useEffect, React démonte proprement
// (et nettoie via la fonction de retour de useEffect, pas juste au
// démontage final de la carte) toute flèche dont le pays n'est plus dans
// l'onglet actif — vérifié en direct, cf. script de test.
function AnimatedFlowArrow({ originLat, originLng }: AnimatedFlowArrowProps) {
  const markerRef = useRef<L.Marker>(null)
  const bearing = useMemo(
    () => bearingDegrees(originLat, originLng, TUNISIA[0], TUNISIA[1]),
    [originLat, originLng]
  )

  useEffect(() => {
    let frameId: number
    const start = performance.now()

    function tick(now: number) {
      const t = ((now - start) % ARROW_CYCLE_MS) / ARROW_CYCLE_MS
      const lat = originLat + (TUNISIA[0] - originLat) * t
      const lng = originLng + (TUNISIA[1] - originLng) * t
      markerRef.current?.setLatLng([lat, lng])
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameId)
  }, [originLat, originLng])

  return (
    <Marker ref={markerRef} position={[originLat, originLng]} icon={arrowDivIcon(bearing)} interactive={false} />
  )
}

// Remplace @vis.gl/react-google-maps (Google Maps) pour cette carte
// uniquement — le reste du projet (AddressAutocomplete, GoogleMapsProvider)
// continue de dépendre de Google Maps, cette dépendance-là n'est PAS
// retirée. Chargé exclusivement côté client via next/dynamic({ssr:false})
// depuis CountryFlowSection.tsx : Leaflet touche `window` dès l'import du
// module, incompatible avec le rendu serveur de Next.js App Router.
export function CountryFlowMap({ rows, totalCount }: CountryFlowMapProps) {
  const geoRows = useMemo(() => rows.filter((r) => r.lat !== null && r.lng !== null), [rows])

  if (geoRows.length === 0) return null

  return (
    <MapContainer
      center={[25, 15]}
      zoom={2}
      scrollWheelZoom={false}
      className="h-80 w-full overflow-hidden rounded-lg border border-slate-200"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

      {geoRows.map((row) => (
        <Polyline
          key={`line-${row.label}`}
          positions={[[row.lat as number, row.lng as number], TUNISIA]}
          pathOptions={{ className: 'jibli-flow-line', color: '#0D6E4E', weight: 2, opacity: 0.6 }}
        />
      ))}

      {geoRows.map((row) => (
        <AnimatedFlowArrow key={`arrow-${row.label}`} originLat={row.lat as number} originLng={row.lng as number} />
      ))}

      {geoRows.map((row) => (
        <Marker
          key={`marker-${row.label}`}
          position={[row.lat as number, row.lng as number]}
          icon={countryDivIcon()}
          alt={`${row.label} — ${row.count} annonce${row.count > 1 ? 's' : ''}`}
        />
      ))}

      <Marker position={TUNISIA} icon={hubDivIcon(totalCount)} alt={`Tunisie — ${totalCount} au total`} />
    </MapContainer>
  )
}
