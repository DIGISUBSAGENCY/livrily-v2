'use client'

import { Map, Marker } from '@vis.gl/react-google-maps'

interface OrderTrackingMapProps {
  position: { lat: number; lng: number }
  destination: { lat: number; lng: number } | null
}

// Carte affichée uniquement pendant le statut "delivering". `position` est
// la dernière position connue (issue de delivery_tracking en temps réel).
export function OrderTrackingMap({ position, destination }: OrderTrackingMapProps) {
  return (
    <div className="h-72 w-full overflow-hidden rounded-lg border border-slate-200">
      <Map center={position} zoom={15} gestureHandling="greedy" disableDefaultUI={false}>
        <Marker position={position} title="Livraison en cours" />
        {destination && <Marker position={destination} title="Adresse de livraison" opacity={0.6} />}
      </Map>
    </div>
  )
}
