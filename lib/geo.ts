interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_METERS = 6371000

// Distance à vol d'oiseau entre deux points (formule de Haversine). Utilisé
// pour vérifier côté serveur qu'une adresse de livraison tombe bien dans le
// rayon de la zone du commerce, sans repasser par une requête PostGIS.
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}
