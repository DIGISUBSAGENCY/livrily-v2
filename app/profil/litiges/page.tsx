import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PartyPopper } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DisputeStatusBadge } from '@/components/travel/DisputeStatusBadge'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { pageMetadata } from '@/lib/seo'
import type { DisputeStatus } from '@/types/database'

export const metadata: Metadata = pageMetadata({
  title: 'Mes litiges',
  description: 'Suivi de tes litiges sur les missions Livrily.',
  noIndex: true,
})

interface LitigesPageProps {
  searchParams: Promise<{ status?: string }>
}

const filters: { value: 'all' | DisputeStatus; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'open', label: 'Ouverts' },
  { value: 'resolved', label: 'Résolus' },
]

// RLS (disputes_select_involved) filtre déjà aux litiges où l'utilisateur
// est ouvreur, client de la mission, ou voyageur accepté — pas de .eq
// supplémentaire nécessaire côté requête pour ça.
export default async function LitigesPage({ searchParams }: LitigesPageProps) {
  const { status } = await searchParams
  const activeFilter = status === 'open' || status === 'resolved' ? status : 'all'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/profil/litiges')

  let query = supabase.from('disputes').select('*').order('created_at', { ascending: false })
  if (activeFilter !== 'all') query = query.eq('status', activeFilter)
  const { data: disputes, error } = await query

  const requestIds = Array.from(new Set((disputes ?? []).map((d) => d.travel_request_id)))
  const { data: requests } = requestIds.length
    ? await supabase.from('travel_requests').select('id, item_description').in('id', requestIds)
    : { data: [] }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r.item_description]))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mes litiges</h1>
      <p className="mt-1 text-sm text-slate-500">
        Litiges sur tes missions Jibli, en tant que client ou voyageur.
      </p>

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={f.value === 'all' ? '/profil/litiges' : `/profil/litiges?status=${f.value}`}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              activeFilter === f.value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger tes litiges.</p>}

      {!error && disputes && disputes.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <PartyPopper className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun litige pour le moment — c&apos;est plutôt bon signe 🎉</p>
        </div>
      )}

      {!error && disputes && disputes.length > 0 && (
        <div className="mt-6 space-y-3">
          {disputes.map((dispute) => (
            <Link key={dispute.id} href={`/jibli/${dispute.travel_request_id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">
                    {requestById.get(dispute.travel_request_id) ?? 'Mission'}
                  </p>
                  <DisputeStatusBadge status={dispute.status} />
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{dispute.reason}</p>
                <p className="mt-1.5 text-xs text-slate-400">
                  Ouvert le {new Date(dispute.created_at).toLocaleDateString('fr-TN')}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
