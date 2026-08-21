import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DisputeStatusBadge } from '@/components/travel/DisputeStatusBadge'
import { DisputeSearchFilters } from '@/components/admin/DisputeSearchFilters'
import { Card } from '@/components/ui/Card'

interface AdminLitigesPageProps {
  searchParams: Promise<{ q?: string; status?: string }>
}

const PAGE_LIMIT = 100

// Recherche (reason + description de mission) filtrée côté serveur après
// coup, pas en base : reason et item_description vivent dans 2 tables
// différentes, pas de jointure PostgREST simple pour un ilike combiné —
// même choix pragmatique que le reste de l'admin (volume faible pour
// l'instant, cf. commentaire PAGE_LIMIT de /admin/utilisateurs).
export default async function AdminLitigesPage({ searchParams }: AdminLitigesPageProps) {
  const { q = '', status = 'all' } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('disputes').select('*').order('created_at', { ascending: false }).limit(PAGE_LIMIT)
  if (status === 'open' || status === 'resolved') query = query.eq('status', status)
  const { data: disputes, error } = await query

  const requestIds = Array.from(new Set((disputes ?? []).map((d) => d.travel_request_id)))
  const { data: requests } = requestIds.length
    ? await supabase.from('travel_requests').select('id, item_description').in('id', requestIds)
    : { data: [] as { id: string; item_description: string }[] }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r.item_description]))

  const openerIds = Array.from(new Set((disputes ?? []).map((d) => d.opened_by)))
  const { data: openers } = openerIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', openerIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const openerById = new Map((openers ?? []).map((o) => [o.id, o.full_name]))

  const needle = q.trim().toLowerCase()
  const filtered = (disputes ?? []).filter((d) => {
    if (!needle) return true
    const requestLabel = (requestById.get(d.travel_request_id) ?? '').toLowerCase()
    return d.reason.toLowerCase().includes(needle) || requestLabel.includes(needle)
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <AlertTriangle className="h-6 w-6 text-brand-600" aria-hidden />
        Litiges
      </h1>
      <p className="mt-1 text-sm text-slate-500">Litiges ouverts par les clients ou voyageurs sur une mission Jibli.</p>

      <div className="mt-6">
        <DisputeSearchFilters defaultQuery={q} defaultStatus={status} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les litiges.</p>}

      {!error && filtered.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <AlertTriangle className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun litige ne correspond à ces critères.</p>
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="mt-6 space-y-3">
          {filtered.map((dispute) => (
            <Link key={dispute.id} href={`/admin/litiges/${dispute.id}`}>
              <Card interactive>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {requestById.get(dispute.travel_request_id) ?? 'Mission'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Ouvert par {openerById.get(dispute.opened_by) ?? 'Utilisateur'} le{' '}
                      {new Date(dispute.created_at).toLocaleDateString('fr-TN')}
                    </p>
                  </div>
                  <DisputeStatusBadge status={dispute.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{dispute.reason}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
