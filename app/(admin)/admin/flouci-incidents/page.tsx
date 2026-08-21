import Link from 'next/link'
import { AlertOctagon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FlouciIncidentStatusBadge } from '@/components/admin/FlouciIncidentStatusBadge'
import { FlouciIncidentSearchFilters } from '@/components/admin/FlouciIncidentSearchFilters'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { formatTND } from '@/lib/format'

interface AdminFlouciIncidentsPageProps {
  searchParams: Promise<{ q?: string; status?: string }>
}

const PAGE_LIMIT = 100

// Même choix pragmatique que /admin/litiges et /admin/utilisateurs (cf.
// commentaire PAGE_LIMIT) : recherche filtrée côté serveur après coup, pas
// en base, pour rester simple tant que le volume reste faible. Flouci est
// aujourd'hui non configuré en prod (FLOUCI_APP_TOKEN/SECRET absents) donc
// cette liste est normalement vide — elle existe pour être prête le jour où
// Flouci sera activé.
export default async function AdminFlouciIncidentsPage({ searchParams }: AdminFlouciIncidentsPageProps) {
  const { q = '', status = 'all' } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('flouci_payment_incidents').select('*').order('created_at', { ascending: false }).limit(PAGE_LIMIT)
  if (status === 'unresolved' || status === 'resolved') query = query.eq('status', status)
  const { data: incidents, error } = await query

  const clientIds = Array.from(new Set((incidents ?? []).map((i) => i.client_id)))
  const { data: clients } = clientIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', clientIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.full_name]))

  const needle = q.trim().toLowerCase()
  const filtered = (incidents ?? []).filter((i) => {
    if (!needle) return true
    const clientLabel = (clientById.get(i.client_id) ?? '').toLowerCase()
    return i.flouci_payment_id.toLowerCase().includes(needle) || clientLabel.includes(needle)
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <AlertOctagon className="h-6 w-6 text-brand-600" aria-hidden />
        Paiements Flouci orphelins
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Paiements Flouci confirmés réussis (vérifiés auprès de l&apos;API) dont la transaction Livrily n&apos;a pas pu
        être finalisée.
      </p>

      <Alert tone="info" className="mt-4">
        <strong>Aucune action financière automatique n&apos;est déclenchée</strong> depuis cet écran. Résoudre un
        incident enregistre une décision administrative, pas un remboursement.
      </Alert>

      <div className="mt-6">
        <FlouciIncidentSearchFilters defaultQuery={q} defaultStatus={status} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les incidents.</p>}

      {!error && filtered.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <AlertOctagon className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun incident ne correspond à ces critères.</p>
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="mt-6 space-y-3">
          {filtered.map((incident) => (
            <Link key={incident.id} href={`/admin/flouci-incidents/${incident.id}`}>
              <Card interactive>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {clientById.get(incident.client_id) ?? 'Client'} · {formatTND(incident.amount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Réf. Flouci {incident.flouci_payment_id} · {new Date(incident.created_at).toLocaleDateString('fr-TN')}
                    </p>
                  </div>
                  <FlouciIncidentStatusBadge status={incident.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{incident.error_message}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
