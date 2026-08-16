import Link from 'next/link'
import { PackageSearch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { formatTND } from '@/lib/format'
import type { OrderStatus } from '@/types/database'

const tabs: { value: string; label: string; statuses: OrderStatus[] }[] = [
  { value: 'active', label: 'En cours', statuses: ['pending', 'accepted', 'ready', 'delivering'] },
  { value: 'pending', label: 'Nouvelles', statuses: ['pending'] },
  { value: 'done', label: 'Terminées', statuses: ['delivered', 'cancelled'] },
  { value: 'all', label: 'Toutes', statuses: [] },
]

interface AdminOrdersPageProps {
  searchParams: Promise<{ filter?: string }>
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const { filter } = await searchParams
  const activeTab = tabs.find((t) => t.value === filter) ?? tabs[0]
  const supabase = await createClient()

  let query = supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100)
  if (activeTab.statuses.length > 0) {
    query = query.in('status', activeTab.statuses)
  }

  const { data: orders, error } = await query

  const commerceIds = Array.from(new Set((orders ?? []).map((o) => o.commerce_id)))
  const clientIds = Array.from(new Set((orders ?? []).map((o) => o.client_id)))
  const [{ data: commerces }, { data: clients }] = await Promise.all([
    commerceIds.length
      ? supabase.from('commerces').select('id, name').in('id', commerceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    clientIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])
  const commerceById = new Map((commerces ?? []).map((c) => [c.id, c.name]))
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.full_name ?? 'Client']))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Toutes les commandes</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/commandes?filter=${tab.value}`}
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
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <PackageSearch className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune commande dans cette catégorie.</p>
        </div>
      )}

      {!error && orders && orders.length > 0 && (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/admin/commandes/${order.id}`}>
              <Card interactive className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {commerceById.get(order.commerce_id) ?? 'Commerce'} → {clientById.get(order.client_id) ?? 'Client'}
                  </p>
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
