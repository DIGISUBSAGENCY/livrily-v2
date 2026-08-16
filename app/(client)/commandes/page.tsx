import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PackageSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mes commandes',
  description: 'Historique de tes commandes Livrily.',
  noIndex: true,
})

export default async function OrdersHistoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/commandes')

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })

  const commerceIds = Array.from(new Set((orders ?? []).map((o) => o.commerce_id)))
  const { data: commerces } = commerceIds.length
    ? await supabase.from('commerces').select('id, name').in('id', commerceIds)
    : { data: [] }
  const commerceNameById = new Map((commerces ?? []).map((c) => [c.id, c.name]))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Mes commandes</h1>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger tes commandes pour le moment.</p>}

      {!error && orders && orders.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <PackageSearch className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Tu n&apos;as pas encore passé de commande.</p>
          <Link href="/commerces" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
            Parcourir les commerces
          </Link>
        </div>
      )}

      {!error && orders && orders.length > 0 && (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/commandes/${order.id}`}>
              <Card className="flex items-center justify-between gap-4 transition-shadow hover:shadow-md">
                <div>
                  <p className="font-medium text-slate-900">{commerceNameById.get(order.commerce_id) ?? 'Commerce'}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(order.created_at).toLocaleString('fr-TN')} · {formatTND(order.total)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <OrderStatusBadge status={order.status} />
                  {order.payment_status === 'awaiting_verification' && (
                    <Badge tone="warning">Paiement en attente</Badge>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
