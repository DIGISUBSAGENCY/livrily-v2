import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CommerceForm } from '@/components/admin/CommerceForm'
import { ReliabilityHistoryChart } from '@/components/admin/ReliabilityHistoryChart'
import { Card } from '@/components/ui/Card'
import { updateCommerce } from '@/app/(admin)/admin/commerces/actions'

interface EditCommercePageProps {
  params: Promise<{ id: string }>
}

const HISTORY_DAYS = 14

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

// Agrège les commandes livrées des HISTORY_DAYS derniers jours en un
// point par jour (temps de livraison moyen, même approximation
// updated_at - created_at que le dashboard admin et les compteurs de
// fiabilité). Rempli les jours sans livraison à 0 pour garder un axe continu.
function buildHistoryBuckets(rows: { created_at: string; updated_at: string }[]) {
  const sums = new Map<string, { total: number; count: number }>()
  for (const row of rows) {
    const key = dayKey(row.updated_at)
    const minutes = (new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()) / 60000
    const entry = sums.get(key) ?? { total: 0, count: 0 }
    entry.total += minutes
    entry.count += 1
    sums.set(key, entry)
  }

  const buckets = []
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const key = dayKey(d.toISOString())
    const entry = sums.get(key)
    buckets.push({
      date: key,
      avgMinutes: entry ? Math.round(entry.total / entry.count) : 0,
      count: entry?.count ?? 0,
    })
  }
  return buckets
}

export default async function EditCommercePage({ params }: EditCommercePageProps) {
  const { id } = await params
  const supabase = await createClient()

  const historySince = new Date()
  historySince.setDate(historySince.getDate() - HISTORY_DAYS)

  const [{ data: commerce, error }, { data: zones }, { data: recentDelivered }] = await Promise.all([
    supabase.from('commerces').select('*').eq('id', id).single(),
    supabase.from('delivery_zones').select('*').order('name'),
    supabase
      .from('orders')
      .select('created_at, updated_at')
      .eq('commerce_id', id)
      .eq('status', 'delivered')
      .gte('updated_at', historySince.toISOString()),
  ])

  if (error || !commerce) {
    notFound()
  }

  const updateCommerceWithId = updateCommerce.bind(null, commerce.id)
  const historyBuckets = buildHistoryBuckets(recentDelivered ?? [])

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/commerces" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Commerces
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Modifier {commerce.name}</h1>
        <Link href={`/admin/commerces/${commerce.id}/produits`} className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
          <Package className="h-4 w-4" aria-hidden />
          Produits
        </Link>
      </div>

      {!commerce.owner_id && (
        <p className="mt-2 text-sm text-amber-700">
          Ce commerce n&apos;a pas encore de compte lié —{' '}
          <Link href="/admin/comptes-commerce" className="underline">
            gère les comptes commerce
          </Link>
          .
        </p>
      )}

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-slate-900">Fiabilité</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900">
              {commerce.avg_delivery_time_minutes != null ? `${commerce.avg_delivery_time_minutes} min` : '—'}
            </p>
            <p className="text-xs text-slate-500">Temps moyen</p>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900">
              {commerce.on_time_rate != null ? `${commerce.on_time_rate}%` : '—'}
            </p>
            <p className="text-xs text-slate-500">À l&apos;heure</p>
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight text-slate-900">
              {commerce.acceptance_rate != null ? `${commerce.acceptance_rate}%` : '—'}
            </p>
            <p className="text-xs text-slate-500">Acceptation</p>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          {commerce.stats_delivered_count} livraison{commerce.stats_delivered_count > 1 ? 's' : ''} ·{' '}
          {commerce.stats_decided_count} commande{commerce.stats_decided_count > 1 ? 's' : ''} traitée
          {commerce.stats_decided_count > 1 ? 's' : ''}
        </p>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-slate-700">Temps de livraison — {HISTORY_DAYS} derniers jours</p>
          <ReliabilityHistoryChart buckets={historyBuckets} />
        </div>
      </Card>

      <Card className="mt-6">
        <CommerceForm action={updateCommerceWithId} commerce={commerce} zones={zones ?? []} submitLabel="Enregistrer" />
      </Card>
    </main>
  )
}
