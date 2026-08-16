'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { Badge } from '@/components/ui/Badge'
import { OrderTrackingMap } from '@/components/orders/OrderTrackingMap'
import { DeliveryEtaBadge } from '@/components/orders/DeliveryEtaBadge'
import type { OrderStatus, PaymentStatus } from '@/types/database'

interface TrackedPosition {
  lat: number
  lng: number
  recordedAt: string
}

interface OrderRealtimeViewProps {
  orderId: string
  initialStatus: OrderStatus
  initialPaymentStatus: PaymentStatus
  destination: { lat: number; lng: number } | null
  initialPosition: TrackedPosition | null
}

// Client Component : s'abonne à Supabase Realtime pour suivre le statut de
// la commande et la position du commerce pendant la livraison, sans
// recharger la page. Les policies RLS existantes (orders, delivery_tracking)
// s'appliquent aussi aux souscriptions Realtime — pas de fuite de données.
export function OrderRealtimeView({
  orderId,
  initialStatus,
  initialPaymentStatus,
  destination,
  initialPosition,
}: OrderRealtimeViewProps) {
  const [status, setStatus] = useState(initialStatus)
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus)
  const [position, setPosition] = useState(initialPosition)
  const [previousPosition, setPreviousPosition] = useState<TrackedPosition | null>(null)
  // Miroir de `position` en dehors du cycle de rendu : la callback Realtime
  // a besoin de la valeur "juste avant" pour la faire glisser vers
  // `previousPosition` sans dépendre d'un state React potentiellement
  // périmé dans la closure de l'abonnement (souscrit une seule fois au montage).
  const positionRef = useRef(initialPosition)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          const next = payload.new as { status: OrderStatus; payment_status: PaymentStatus }
          setStatus(next.status)
          setPaymentStatus(next.payment_status)
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'delivery_tracking', filter: `order_id=eq.${orderId}` },
        (payload) => {
          const next = payload.new as { lat: number; lng: number; recorded_at: string }
          setPreviousPosition(positionRef.current)
          const nextPosition = { lat: next.lat, lng: next.lng, recordedAt: next.recorded_at }
          positionRef.current = nextPosition
          setPosition(nextPosition)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={status} />
        {paymentStatus === 'awaiting_verification' && (
          <Badge tone="warning">En attente de vérification du paiement</Badge>
        )}
        {paymentStatus === 'rejected' && <Badge tone="danger">Paiement rejeté — renvoie une preuve</Badge>}
      </div>

      {status === 'delivering' && position && (
        <>
          <DeliveryEtaBadge
            position={position}
            previousPosition={previousPosition}
            destination={destination}
            recordedAt={position.recordedAt}
            previousRecordedAt={previousPosition?.recordedAt ?? null}
          />
          <OrderTrackingMap position={position} destination={destination} />
        </>
      )}
    </div>
  )
}
