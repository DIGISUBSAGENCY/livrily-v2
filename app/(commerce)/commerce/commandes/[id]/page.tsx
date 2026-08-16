import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { OrderActions } from '@/components/commerce-dashboard/OrderActions'
import { DeliveryPositionSender } from '@/components/commerce-dashboard/DeliveryPositionSender'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'

interface CommerceOrderPageProps {
  params: Promise<{ id: string }>
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash à la livraison',
  flouci: 'Flouci',
  virement: 'Virement bancaire',
}

export default async function CommerceOrderDetailPage({ params }: CommerceOrderPageProps) {
  const { id } = await params
  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  const supabase = await createClient()
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('commerce_id', commerce.id)
    .single()

  if (error || !order) {
    notFound()
  }

  const [{ data: items }, { data: staff }] = await Promise.all([
    supabase.from('order_items').select('*').eq('order_id', id),
    supabase
      .from('commerce_delivery_staff')
      .select('*')
      .eq('commerce_id', commerce.id)
      .eq('is_active', true)
      .order('full_name'),
  ])

  let prescriptionUrl: string | null = null
  if (order.prescription_url) {
    const { data } = await supabase.storage.from('prescriptions').createSignedUrl(order.prescription_url, 3600)
    prescriptionUrl = data?.signedUrl ?? null
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/commerce/commandes" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Commandes
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Commande du {new Date(order.created_at).toLocaleString('fr-TN')}
          </h1>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.payment_status === 'awaiting_verification' && (
        <Badge tone="warning" className="mt-2">
          En attente de vérification du paiement
        </Badge>
      )}

      {prescriptionUrl && (
        <Card className="mt-4 border-amber-200 bg-amber-50">
          <h2 className="mb-2 font-semibold text-amber-900">Ordonnance à vérifier</h2>
          <p className="mb-2 text-sm text-amber-800">
            Vérifie l&apos;ordonnance avant d&apos;accepter la commande — refuse-la si elle n&apos;est
            pas valide ou lisible.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire */}
          <img src={prescriptionUrl} alt="Ordonnance" className="max-h-80 w-full rounded-lg object-contain" />
        </Card>
      )}

      <Card className="mt-4">
        <OrderActions
          orderId={order.id}
          status={order.status}
          paymentMethod={order.payment_method}
          paymentStatus={order.payment_status}
          staff={staff ?? []}
        />
      </Card>

      {order.status === 'delivering' && (
        <div className="mt-4">
          <DeliveryPositionSender orderId={order.id} />
        </div>
      )}

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
            <span className="text-slate-500">Adresse de livraison : </span>
            {order.delivery_address}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Paiement : </span>
            {paymentMethodLabels[order.payment_method] ?? order.payment_method}
          </p>
          {order.client_note && (
            <p className="mt-1">
              <span className="text-slate-500">Note du client : </span>
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
