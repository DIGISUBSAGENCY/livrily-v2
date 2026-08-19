'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { sendDeliveryPosition } from '@/app/(commerce)/commerce/commandes/actions'
import { Alert } from '@/components/ui/Alert'

const SEND_INTERVAL_MS = 15000

// Actif uniquement pendant que cette commande précise est en "delivering"
// et que cette page reste ouverte — c'est le téléphone du commerce (ou de
// son livreur interne) qui sert de source GPS, il n'y a pas de compte
// livreur séparé qui pourrait émettre en arrière-plan.
export function DeliveryPositionSender({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<'idle' | 'sharing' | 'error'>('idle')
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        lastPositionRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setStatus('sharing')
      },
      () => setStatus('error'),
      { enableHighAccuracy: true, maximumAge: 10000 }
    )

    const interval = setInterval(() => {
      const pos = lastPositionRef.current
      if (pos) void sendDeliveryPosition(orderId, pos.lat, pos.lng)
    }, SEND_INTERVAL_MS)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      clearInterval(interval)
    }
  }, [orderId])

  return (
    <Alert tone="info" icon={MapPin}>
      {status === 'sharing' && 'Ta position est partagée avec le client en direct.'}
      {status === 'idle' && 'Activation du partage de position…'}
      {status === 'error' && (
        <span>
          Impossible d&apos;accéder à ta position. Vérifie les autorisations de localisation de
          ton navigateur/téléphone.
        </span>
      )}
    </Alert>
  )
}
