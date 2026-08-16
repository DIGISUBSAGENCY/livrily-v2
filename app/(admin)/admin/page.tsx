import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, Package, Store, TrendingUp, Clock, CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'

function startOfTodayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const todayIso = startOfTodayIso()

  const [
    { count: ordersToday },
    { data: deliveredToday },
    { count: ordersInProgress },
    { data: recentDelivered },
    { count: commercesActifs },
    { count: ordersAwaiting },
    { count: travelAwaiting },
    { count: travelOpen },
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
    supabase.from('orders').select('total').eq('status', 'delivered').gte('created_at', todayIso),
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'accepted', 'ready', 'delivering']),
    // Échantillon récent pour approximer le temps de livraison moyen — pas
    // de colonne "delivered_at" dédiée, on utilise updated_at (mis à jour à
    // chaque changement de statut, donc proche du moment de livraison pour
    // la dernière transition vers "delivered").
    supabase.from('orders').select('created_at, updated_at').eq('status', 'delivered').order('created_at', { ascending: false }).limit(100),
    supabase.from('commerces').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'awaiting_verification'),
    supabase.from('travel_payments').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_verification'),
    supabase.from('travel_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  const caToday = (deliveredToday ?? []).reduce((sum, o) => sum + o.total, 0)

  const avgDeliveryMinutes = (() => {
    const rows = recentDelivered ?? []
    if (rows.length === 0) return null
    const totalMinutes = rows.reduce((sum, o) => {
      const diffMs = new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()
      return sum + diffMs / 60000
    }, 0)
    return Math.round(totalMinutes / rows.length)
  })()

  const paymentsPending = (ordersAwaiting ?? 0) + (travelAwaiting ?? 0)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tableau de bord</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-brand-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{ordersToday ?? 0}</p>
            <p className="text-sm text-slate-500">Commandes aujourd&apos;hui</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-brand-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{formatTND(caToday)}</p>
            <p className="text-sm text-slate-500">CA du jour (livrées)</p>
          </div>
        </Card>

        <Link href="/admin/commandes">
          <Card interactive className="flex items-center gap-3">
            <Package className="h-6 w-6 text-blue-600" aria-hidden />
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-900">{ordersInProgress ?? 0}</p>
              <p className="text-sm text-slate-500">Commandes en cours</p>
            </div>
          </Card>
        </Link>

        <Card className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-slate-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">
              {avgDeliveryMinutes != null ? `${avgDeliveryMinutes} min` : '—'}
            </p>
            <p className="text-sm text-slate-500">Temps de livraison moyen</p>
          </div>
        </Card>

        <Link href="/admin/commerces">
          <Card interactive className="flex items-center gap-3">
            <Store className="h-6 w-6 text-slate-600" aria-hidden />
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-900">{commercesActifs ?? 0}</p>
              <p className="text-sm text-slate-500">Commerces actifs</p>
            </div>
          </Card>
        </Link>

        <Card className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-amber-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{paymentsPending}</p>
            <p className="text-sm text-slate-500">Paiements en attente (total)</p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/paiements">
          <Card interactive className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Paiements commandes</p>
              <p className="text-sm text-slate-500">Virements en attente de vérification</p>
            </div>
            {(ordersAwaiting ?? 0) > 0 && <Badge tone="warning">{ordersAwaiting}</Badge>}
          </Card>
        </Link>

        <Link href="/admin/jibli-paiements">
          <Card interactive className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Paiements Jibli</p>
              <p className="text-sm text-slate-500">
                Virements escrow en attente · {travelOpen ?? 0} demande{(travelOpen ?? 0) > 1 ? 's' : ''} ouverte
                {(travelOpen ?? 0) > 1 ? 's' : ''}
              </p>
            </div>
            {(travelAwaiting ?? 0) > 0 && <Badge tone="warning">{travelAwaiting}</Badge>}
          </Card>
        </Link>
      </div>

    </main>
  )
}
