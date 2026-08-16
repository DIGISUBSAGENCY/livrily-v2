'use client'

import { useEffect, useState } from 'react'
import { Clock, WifiOff } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { haversineDistanceMeters } from '@/lib/geo'

interface LatLng {
  lat: number
  lng: number
}

interface DeliveryEtaBadgeProps {
  position: LatLng
  previousPosition: LatLng | null
  destination: LatLng | null
  recordedAt: string | null
  previousRecordedAt: string | null
}

// Vitesse moyenne de repli quand on n'a pas encore deux positions pour
// calculer une vitesse réelle (première position reçue) — estimation basse
// pour rester réaliste en usage urbain (arrêts, feux, circulation).
const FALLBACK_SPEED_KMH = 22
// Bornes de clamp sur la vitesse calculée entre deux positions GPS
// successives : en dessous, on suppose un arrêt (feu, livraison précédente)
// et on retombe sur le repli plutôt que d'afficher une ETA qui explose ; au
// dessus, c'est du bruit GPS (saut de position) qu'on ignore de la même
// façon plutôt que d'afficher une ETA anormalement optimiste.
const MIN_PLAUSIBLE_SPEED_KMH = 4
const MAX_PLAUSIBLE_SPEED_KMH = 70
const STALE_AFTER_MS = 3 * 60 * 1000
const TICK_MS = 10000

function estimateSpeedKmh(
  position: LatLng,
  previousPosition: LatLng | null,
  recordedAt: string | null,
  previousRecordedAt: string | null
): number {
  if (!previousPosition || !recordedAt || !previousRecordedAt) return FALLBACK_SPEED_KMH

  const deltaMs = new Date(recordedAt).getTime() - new Date(previousRecordedAt).getTime()
  if (deltaMs < 5000) return FALLBACK_SPEED_KMH // trop rapproché pour être fiable

  const deltaMeters = haversineDistanceMeters(previousPosition, position)
  const speedKmh = (deltaMeters / 1000) / (deltaMs / 3600000)

  if (speedKmh < MIN_PLAUSIBLE_SPEED_KMH || speedKmh > MAX_PLAUSIBLE_SPEED_KMH) return FALLBACK_SPEED_KMH
  return speedKmh
}

// Affiche une ETA estimée (distance restante / vitesse moyenne du livreur,
// avec repli sur une vitesse urbaine par défaut) et bascule sur un badge
// "signal perdu" si aucune position n'a été reçue depuis plus de 3 minutes —
// rassure sans faire paniquer sur un simple trou de réseau.
export function DeliveryEtaBadge({
  position,
  previousPosition,
  destination,
  recordedAt,
  previousRecordedAt,
}: DeliveryEtaBadgeProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(interval)
  }, [])

  const isStale = recordedAt != null && now - new Date(recordedAt).getTime() > STALE_AFTER_MS

  if (isStale) {
    return (
      <Badge tone="warning" className="flex w-fit items-center gap-1.5">
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        Signal perdu — dernière position il y a plus de 3 min
      </Badge>
    )
  }

  if (!destination) return null

  const distanceMeters = haversineDistanceMeters(position, destination)
  const speedKmh = estimateSpeedKmh(position, previousPosition, recordedAt, previousRecordedAt)
  const etaMinutes = Math.max(1, Math.round((distanceMeters / 1000 / speedKmh) * 60))
  const distanceKm = (distanceMeters / 1000).toFixed(distanceMeters < 1000 ? 2 : 1)

  return (
    <Badge tone="info" className="flex w-fit items-center gap-1.5">
      <Clock className="h-3.5 w-3.5" aria-hidden />
      Arrivée estimée dans ~{etaMinutes} min ({distanceKm} km)
    </Badge>
  )
}
