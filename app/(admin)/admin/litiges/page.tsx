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
    ? await supabase.from('travel_requests').select('id, item_description, client_id, accepted_proposal_id').in('id', requestIds)
    : { data: [] as { id: string; item_description: string; client_id: string; accepted_proposal_id: string | null }[] }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]))

  const proposalIds = Array.from(new Set((requests ?? []).map((r) => r.accepted_proposal_id).filter((v): v is string => !!v)))
  const { data: proposals } = proposalIds.length
    ? await supabase.from('travel_proposals').select('id, voyageur_id').in('id', proposalIds)
    : { data: [] as { id: string; voyageur_id: string }[] }
  const voyageurIdByProposal = new Map((proposals ?? []).map((p) => [p.id, p.voyageur_id]))

  const profileIds = Array.from(
    new Set([
      ...(disputes ?? []).map((d) => d.opened_by),
      ...(requests ?? []).map((r) => r.client_id),
      ...(proposals ?? []).map((p) => p.voyageur_id),
    ])
  )
  const { data: profileRows } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', profileIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const nameById = new Map((profileRows ?? []).map((p) => [p.id, p.full_name]))

  const needle = q.trim().toLowerCase()
  const rows = (disputes ?? [])
    .map((d) => {
      const request = requestById.get(d.travel_request_id)
      const voyageurId = request?.accepted_proposal_id ? voyageurIdByProposal.get(request.accepted_proposal_id) : null
      return {
        dispute: d,
        requestLabel: request?.item_description ?? 'Mission',
        clientName: request ? (nameById.get(request.client_id) ?? 'Client') : '—',
        voyageurName: voyageurId ? (nameById.get(voyageurId) ?? 'Voyageur') : 'Aucun voyageur accepté',
      }
    })
    .filter((r) => {
      if (!needle) return true
      return r.dispute.reason.toLowerCase().includes(needle) || r.requestLabel.toLowerCase().includes(needle)
    })
    // Ouverts en premier (une seule requête n'imposerait pas cet ordre en
    // combinaison avec le filtre statut ci-dessus), puis les plus récents
    // d'abord dans chaque groupe — calculé en JS, même convention que le
    // reste de cette page (volume faible).
    .sort((a, b) => {
      if (a.dispute.status !== b.dispute.status) return a.dispute.status === 'open' ? -1 : 1
      return new Date(b.dispute.created_at).getTime() - new Date(a.dispute.created_at).getTime()
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

      {!error && rows.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <AlertTriangle className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun litige ne correspond à ces critères.</p>
        </div>
      )}

      {!error && rows.length > 0 && (
        <div className="mt-6 space-y-3">
          {rows.map(({ dispute, requestLabel, clientName, voyageurName }) => (
            <Card key={dispute.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/jibli/${dispute.travel_request_id}`} className="truncate font-medium text-slate-900 hover:underline">
                    {requestLabel}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Client : {clientName} · Voyageur : {voyageurName}
                  </p>
                  <p className="text-xs text-slate-400">Ouvert le {new Date(dispute.created_at).toLocaleDateString('fr-TN')}</p>
                </div>
                <DisputeStatusBadge status={dispute.status} />
              </div>

              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{dispute.reason}</p>

              <Link
                href={`/admin/litiges/${dispute.id}`}
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                Voir le litige →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
