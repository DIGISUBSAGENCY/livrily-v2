'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
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

// row.label peut venir du texte libre saisi par un voyageur (repli non
// reconnu, cf. lib/countryGeo.ts) — jamais interpolé tel quel dans du HTML
// brut (L.divIcon assigne `html` en innerHTML, sans échappement). Seul
// point de ce fichier qui interpole du texte utilisateur (totalCount est
// un nombre, pas un risque).
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// DivIcon = HTML brut injecté par Leaflet hors de l'arbre React — les
// classes Tailwind s'appliquent quand même (la feuille de style compilée
// est globale, pas liée au rendu React). animate-ping = animation Tailwind
// native pour le halo pulsant, pas de CSS custom nécessaire pour ça.
//
// Étiquette du pays (nom) : intégrée directement dans ce HTML plutôt qu'un
// <Tooltip permanent> Leaflet séparé — cohérent avec le pattern déjà en
// place ici (halo et badge hub sont déjà du HTML custom dans le même
// divIcon), évite d'introduire un nouveau primitif Leaflet et sa propre
// classe CSS globale à thémer. Positionnée en `absolute`, EN DEHORS de la
// boîte nominale 16×16 (iconSize/iconAnchor inchangés, donc le point
// d'ancrage géographique du cercle ne bouge pas) — Leaflet ne rogne pas ce
// dépassement (vérifié : pas de overflow:hidden sur .leaflet-marker-icon
// dans son CSS).
//
// placeAbove : au-dessus si le hub Tunisie est en dessous de ce marqueur
// (pays à une latitude ≥ Tunisie), en dessous sinon — évite que le label
// empiète sur le badge du hub pour les pays proches de la Tunisie
// (Algérie/Libye/Mauritanie/Golfe, au sud de la Tunisie). Approximation
// sur lat/lng bruts (pas la précision pixel-projeté de AnimatedFlowArrow) :
// suffisant ici, il s'agit juste d'éloigner le label du hub, pas de le
// superposer exactement à un tracé. Chevauchement ENTRE deux labels de
// pays proches l'un de l'autre (pas du hub) non traité — volume de pays
// actuel trop faible pour justifier un algorithme de placement générique.
function countryDivIcon(label: string, placeAbove: boolean): L.DivIcon {
  const labelPositionClass = placeAbove ? 'bottom-full mb-1' : 'top-full mt-1'
  return L.divIcon({
    html: `
      <span class="relative flex h-4 w-4">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75"></span>
        <span class="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 ring-2 ring-white"></span>
        <span class="absolute left-1/2 ${labelPositionClass} -translate-x-1/2 whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">${escapeHtml(label)}</span>
      </span>
    `,
    className: '', // vide : sans ça Leaflet ajoute sa propre classe par défaut (fond blanc, bordure) par-dessus notre HTML
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

// Hub Tunisie : même traitement mais plus grand, avec le badge du total —
// interpolé directement dans le HTML (re-généré si totalCount change). Le
// CERCLE (h-11 w-11, iconSize) reste fixe quel que soit le nombre de
// chiffres — seul le texte s'adapte (overflow-hidden + font-size réduite à
// partir de 3 chiffres) : sans ça, "201" en text-sm déborde visiblement du
// cercle de 44px et donne l'impression que le badge entier grandit, alors
// que le cercle lui-même ne bougeait déjà pas (bug trouvé en le signalant :
// c'est bien le TEXTE qui débordait, pas le conteneur qui grandissait).
function hubDivIcon(totalCount: number): L.DivIcon {
  const digits = String(totalCount).length
  const textSizeClass = digits >= 3 ? 'text-xs' : 'text-sm'
  return L.divIcon({
    html: `
      <span class="relative flex h-11 w-11 items-center justify-center">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60"></span>
        <span class="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-brand-700 ${textSizeClass} font-bold leading-none text-white ring-4 ring-white shadow-soft-lg">
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
//
// Position ET angle calculés en espace ÉCRAN PROJETÉ (map.latLngToLayerPoint),
// PAS sur les lat/lng bruts — bug trouvé et corrigé : Leaflet dessine le
// Polyline comme une ligne droite entre les points PROJETÉS (Web Mercator,
// CRS par défaut, jamais changé sur cette carte), pas entre les lat/lng
// bruts. Une interpolation/un atan2 sur lat/lng bruts suit donc un tracé ET
// un angle différents de ce que l'œil voit réellement sur cette carte —
// visible surtout sur de longues distances/hautes latitudes (Europe →
// Tunisie, exactement notre cas). En interpolant dans le MÊME espace que
// celui utilisé pour dessiner la ligne, les deux sont, par construction,
// rigoureusement superposés à tout instant t.
function AnimatedFlowArrow({ originLat, originLng }: AnimatedFlowArrowProps) {
  const map = useMap()
  const markerRef = useRef<L.Marker>(null)

  // L'angle écran entre 2 points PROJETÉS fixes est invariant au zoom
  // (Web Mercator n'applique qu'une mise à l'échelle isotrope + translation
  // entre niveaux de zoom — jamais de déformation de l'angle relatif entre
  // 2 points fixes) : calculé une seule fois, pas recalculé à chaque frame,
  // contrairement à la position (cf. useEffect ci-dessous).
  const bearing = useMemo(() => {
    const originPoint = map.latLngToLayerPoint([originLat, originLng])
    const destPoint = map.latLngToLayerPoint(TUNISIA)
    const dx = destPoint.x - originPoint.x
    const dy = destPoint.y - originPoint.y
    // En pixels écran, y croît vers le BAS (contraire d'un repère
    // mathématique standard) — atan2(dx, -dy) donne 0° = vers le haut de
    // l'écran, cohérent avec l'icône dessinée pointe-en-haut (cf.
    // arrowDivIcon, path SVG qui pointe vers y=0).
    return (Math.atan2(dx, -dy) * 180) / Math.PI
  }, [map, originLat, originLng])

  useEffect(() => {
    let frameId: number
    const start = performance.now()
    const originLatLng = L.latLng(originLat, originLng)
    const destLatLng = L.latLng(TUNISIA[0], TUNISIA[1])

    function tick(now: number) {
      const t = ((now - start) % ARROW_CYCLE_MS) / ARROW_CYCLE_MS

      // Reprojeté à CHAQUE frame (pas mémorisé) : latLngToLayerPoint
      // dépend du zoom/pan courants, qui peuvent changer pendant que
      // l'animation tourne. Interpolation linéaire en pixels (mêmes
      // points, même méthode que ceux utilisés par le Polyline pour
      // dessiner la ligne), puis reconversion en lat/lng pour
      // marker.setLatLng (Leaflet positionne toujours un Marker par
      // lat/lng, jamais par pixel brut).
      const originPoint = map.latLngToLayerPoint(originLatLng)
      const destPoint = map.latLngToLayerPoint(destLatLng)
      const point = originPoint.add(destPoint.subtract(originPoint).multiplyBy(t))
      markerRef.current?.setLatLng(map.layerPointToLatLng(point))

      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameId)
  }, [map, originLat, originLng])

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
          icon={countryDivIcon(row.label, (row.lat as number) >= TUNISIA[0])}
          alt={`${row.label} — ${row.count} annonce${row.count > 1 ? 's' : ''}`}
        />
      ))}

      <Marker position={TUNISIA} icon={hubDivIcon(totalCount)} alt={`Tunisie — ${totalCount} au total`} />
    </MapContainer>
  )
}
