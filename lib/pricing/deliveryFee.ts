import { haversineDistanceMeters } from '@/lib/geo'

interface LatLng {
  lat: number
  lng: number
}

interface SurgeRule {
  days_of_week: number[]
  start_time: string // 'HH:MM:SS' (Postgres time)
  end_time: string
  multiplier: number
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Heure/jour "muraux" en Tunisie, indépendamment du fuseau du serveur
// (souvent UTC en hébergement) — Africa/Tunis est fixe toute l'année
// (pas de changement d'heure depuis 2009).
function tunisTimeParts(date: Date): { minutesSinceMidnight: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Tunis',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    minutesSinceMidnight: Number(get('hour')) * 60 + Number(get('minute')),
    dayOfWeek: WEEKDAY_INDEX[get('weekday')] ?? date.getDay(),
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

// Multiplicateur de majoration actif pour une zone à un instant donné. Ne
// gère pas les créneaux traversant minuit (contrainte `start_time < end_time`
// posée en base) — pas de besoin identifié pour ce marché, à étendre si
// besoin. Si plusieurs règles actives se chevauchent, seule la plus forte
// s'applique (pas de cumul, pour rester prévisible côté client).
export function activeSurgeMultiplier(rules: SurgeRule[], at: Date = new Date()): number {
  const { minutesSinceMidnight, dayOfWeek } = tunisTimeParts(at)
  let best = 1
  for (const rule of rules) {
    if (!rule.days_of_week.includes(dayOfWeek)) continue
    const start = timeToMinutes(rule.start_time)
    const end = timeToMinutes(rule.end_time)
    if (minutesSinceMidnight < start || minutesSinceMidnight >= end) continue
    best = Math.max(best, rule.multiplier)
  }
  return best
}

export interface DeliveryFeeResult {
  fee: number
  distanceMeters: number
  surgeMultiplier: number
}

// Frais de livraison = (frais de base + frais/km × distance réelle
// commerce → adresse de livraison) × majoration heure de pointe active.
// Distance à vol d'oiseau (Haversine, comme le reste du projet) plutôt
// qu'une distance routière via une API de routage (Directions/Distance
// Matrix) : évite une dépendance externe et une clé Google Cloud
// supplémentaires pour l'instant — à revoir si l'écart devient un problème
// concret sur des zones à fort détour routier.
export function calculateDeliveryFee(params: {
  commerceOrigin: LatLng
  destination: LatLng
  baseFee: number
  feePerKm: number
  surgeRules: SurgeRule[]
  at?: Date
}): DeliveryFeeResult {
  const { commerceOrigin, destination, baseFee, feePerKm, surgeRules, at } = params
  const distanceMeters = haversineDistanceMeters(commerceOrigin, destination)
  const surgeMultiplier = activeSurgeMultiplier(surgeRules, at)
  const fee = (baseFee + feePerKm * (distanceMeters / 1000)) * surgeMultiplier

  return {
    fee: Number(fee.toFixed(3)),
    distanceMeters,
    surgeMultiplier,
  }
}
