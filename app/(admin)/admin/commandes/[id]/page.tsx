import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { OrderTrackingMap } from '@/components/orders/OrderTrackingMap'
import { DeliveryEtaBadge } from '@/components/orders/DeliveryEtaBadge'
import { AdminOrderControls } from '@/components/admin/AdminOrderControls'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash à la livraison',
  flouci: 'Flouci',
  virement: 'Virement bancaire',
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: order, error } = await supabase.from('orders').select('*').eq('id', id).single()

  if (error || !order) {
    notFound()
  }

  const [{ data: commerce }, { data: client }, { data: items }, { data: staff }, { data: lastTracking }] =
    await Promise.all([
      supabase.from('commerces').select('name, address, phone').eq('id', order.commerce_id).single(),
      supabase.from('profiles').select('full_name, phone').eq('id', order.client_id).single(),
      supabase.from('order_items').select('*').eq('order_id', id),
      supabase
        .from('commerce_delivery_staff')
        .select('*')
        .eq('commerce_id', order.commerce_id)
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('delivery_tracking')
        .select('lat, lng, recorded_at')
        .eq('order_id', id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  let deliveryProofUrl: string | null = null
  if (order.delivery_proof_url) {
    const { data } = await supabase.storage.from('delivery-proofs').createSignedUrl(order.delivery_proof_url, 3600)
    deliveryProofUrl = data?.signedUrl ?? null
  }

  let prescriptionUrl: string | null = null
  if (order.prescription_url) {
    const { data } = await supabase.storage.from('prescriptions').createSignedUrl(order.prescription_url, 3600)
    prescriptionUrl = data?.signedUrl ?? null
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin/commandes" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Toutes les commandes
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{commerce?.name ?? 'Commerce'}</h1>
          <p className="text-sm text-slate-500">
            Commande du {new Date(order.created_at).toLocaleString('fr-TN')}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.payment_status === 'awaiting_verification' && (
        <Badge tone="warning" className="mt-2">
          Paiement en attente de vérification
        </Badge>
      )}
      {order.payment_status === 'rejected' && (
        <Badge tone="danger" className="mt-2">
          Paiement rejeté
        </Badge>
      )}

      {order.status === 'delivering' && lastTracking && (
        <div className="mt-4 space-y-2">
          <DeliveryEtaBadge
            position={{ lat: lastTracking.lat, lng: lastTracking.lng }}
            previousPosition={null}
            destination={
              order.delivery_lat != null && order.delivery_lng != null
                ? { lat: order.delivery_lat, lng: order.delivery_lng }
                : null
            }
            recordedAt={lastTracking.recorded_at}
            previousRecordedAt={null}
          />
          <OrderTrackingMap
            position={{ lat: lastTracking.lat, lng: lastTracking.lng }}
            destination={
              order.delivery_lat != null && order.delivery_lng != null
                ? { lat: order.delivery_lat, lng: order.delivery_lng }
                : null
            }
          />
        </div>
      )}

      {deliveryProofUrl && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold text-slate-900">Preuve de livraison</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
          <img src={deliveryProofUrl} alt="Preuve de livraison" className="max-h-80 w-full rounded-lg object-contain" />
        </Card>
      )}

      {prescriptionUrl && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold text-slate-900">Ordonnance</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
          <img src={prescriptionUrl} alt="Ordonnance" className="max-h-80 w-full rounded-lg object-contain" />
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold text-slate-900">Intervention admin</h2>
        <AdminOrderControls
          orderId={order.id}
          currentStatus={order.status}
          currentStaffId={order.delivery_staff_id}
          staff={staff ?? []}
        />
      </Card>

      <Card className="mt-4 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">Articles</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {items?.map((item) => (
              <li key={item.id} className="flex justify-between text-slate-700">
                <span>
                  {item.quantity} × {item.product_name_snapshot}
                </span>
                <span>{formatTND(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>Sous-total</span>
            <span>{formatTND(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frais de livraison</span>
            <span>{formatTND(order.delivery_fee)}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900">
            <span>Total</span>
            <span>{formatTND(order.total)}</span>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-3 text-sm text-slate-600">
          <p>
            <span className="text-slate-500">Client : </span>
            {client?.full_name ?? 'Client'} {client?.phone ? `· ${client.phone}` : ''}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Commerce : </span>
            {commerce?.name} {commerce?.phone ? `· ${commerce.phone}` : ''}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Adresse de livraison : </span>
            {order.delivery_address}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Paiement : </span>
            {paymentMethodLabels[order.payment_method] ?? order.payment_method}
          </p>
          {order.client_note && (
            <p className="mt-1">
              <span className="text-slate-500">Note : </span>
              {order.client_note}
            </p>
          )}
          {order.cancelled_reason && (
            <p className="mt-1">
              <span className="text-slate-500">Motif d&apos;annulation : </span>
              {order.cancelled_reason}
            </p>
          )}
        </div>
      </Card>
    </main>
  )
}
