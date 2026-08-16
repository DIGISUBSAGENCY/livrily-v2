import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { formatTND } from '@/lib/format'
import type { OrderStatus } from '@/types/database'

const tabs: { value: string; label: string; statuses: OrderStatus[] }[] = [
  { value: 'pending', label: 'Nouvelles', statuses: ['pending'] },
  { value: 'active', label: 'En cours', statuses: ['accepted', 'ready', 'delivering'] },
  { value: 'done', label: 'Terminées', statuses: ['delivered', 'cancelled'] },
  { value: 'all', label: 'Toutes', statuses: [] },
]

interface CommerceOrdersPageProps {
  searchParams: Promise<{ filter?: string }>
}

export default async function CommerceOrdersPage({ searchParams }: CommerceOrdersPageProps) {
  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  const { filter } = await searchParams
  const activeTab = tabs.find((t) => t.value === filter) ?? tabs[0]

  const supabase = await createClient()
  let query = supabase
    .from('orders')
    .select('*')
    .eq('commerce_id', commerce.id)
    .order('created_at', { ascending: false })

  if (activeTab.statuses.length > 0) {
    query = query.in('status', activeTab.statuses)
  }

  const { data: orders, error } = await query

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Commandes</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/commerce/commandes?filter=${tab.value}`}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              activeTab.value === tab.value
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les commandes.</p>}

      {!error && orders && orders.length === 0 && (
        <p className="mt-12 text-center text-slate-500">Aucune commande dans cette catégorie.</p>
      )}

      {!error && orders && orders.length > 0 && (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/commerce/commandes/${order.id}`}>
              <Card interactive className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{order.delivery_address}</p>
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
