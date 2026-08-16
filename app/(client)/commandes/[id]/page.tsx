import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { OrderRealtimeView } from '@/components/orders/OrderRealtimeView'
import { ResubmitPaymentProof } from '@/components/orders/ResubmitPaymentProof'
import { RatingForm } from '@/components/orders/RatingForm'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'
import { Star } from 'lucide-react'

interface OrderPageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = pageMetadata({
  title: 'Détail de la commande',
  description: 'Suivi et détail de ta commande Livrily.',
  noIndex: true,
})

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash à la livraison',
  flouci: 'Flouci',
  virement: 'Virement bancaire',
}

export default async function OrderDetailPage({ params }: OrderPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/commandes/${id}`)

  const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', id).single()

  if (orderError || !order) {
    notFound()
  }

  const [{ data: commerce }, { data: items }, { data: lastTracking }, { data: rating }] = await Promise.all([
    supabase.from('commerces').select('name, address').eq('id', order.commerce_id).single(),
    supabase.from('order_items').select('*').eq('order_id', id),
    supabase
      .from('delivery_tracking')
      .select('lat, lng, recorded_at')
      .eq('order_id', id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('ratings').select('score, comment').eq('order_id', id).maybeSingle(),
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
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/commandes" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Mes commandes
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{commerce?.name ?? 'Commande'}</h1>
          <p className="text-sm text-slate-500">
            Commande du {new Date(order.created_at).toLocaleString('fr-TN')}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <OrderRealtimeView
          orderId={order.id}
          initialStatus={order.status}
          initialPaymentStatus={order.payment_status}
          destination={
            order.delivery_lat != null && order.delivery_lng != null
              ? { lat: order.delivery_lat, lng: order.delivery_lng }
              : null
          }
          initialPosition={
            lastTracking
              ? { lat: lastTracking.lat, lng: lastTracking.lng, recordedAt: lastTracking.recorded_at }
              : null
          }
        />
      </div>

      {order.payment_method === 'virement' && order.payment_status === 'rejected' && order.status === 'pending' && (
        <div className="mt-6">
          <ResubmitPaymentProof orderId={order.id} />
        </div>
      )}

      {prescriptionUrl && (
        <Card className="mt-6">
          <h2 className="mb-2 font-semibold text-slate-900">Ton ordonnance</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
          <img src={prescriptionUrl} alt="Ordonnance" className="max-h-80 w-full rounded-lg object-contain" />
        </Card>
      )}

      {order.status === 'delivered' && deliveryProofUrl && (
        <Card className="mt-6">
          <h2 className="mb-2 font-semibold text-slate-900">Preuve de livraison</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire, pas d'optimisation next/image pertinente */}
          <img src={deliveryProofUrl} alt="Preuve de livraison" className="max-h-80 w-full rounded-lg object-contain" />
        </Card>
      )}

      {order.status === 'delivered' && !rating && (
        <div className="mt-6">
          <RatingForm orderId={order.id} />
        </div>
      )}

      {order.status === 'delivered' && rating && (
        <Card className="mt-6">
          <div className="flex items-center gap-2">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((v) => (
                <Star key={v} className={`h-4 w-4 ${v <= rating.score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
              ))}
            </div>
            <Badge tone="neutral">Ton avis</Badge>
          </div>
          {rating.comment && <p className="mt-2 text-sm text-slate-600">{rating.comment}</p>}
        </Card>
      )}

      <Card className="mt-6 space-y-4">
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
        </div>
      </Card>
    </main>
  )
}
