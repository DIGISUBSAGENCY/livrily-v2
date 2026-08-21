import Link from 'next/link'
import { Package, AlertTriangle, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { RequestSearchFilters } from '@/components/admin/RequestSearchFilters'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'
import type { TravelRequestStatus } from '@/types/database'

const REQUEST_STATUSES: TravelRequestStatus[] = ['open', 'matched', 'in_transit', 'completed', 'cancelled']

function isRequestStatus(value: string): value is TravelRequestStatus {
  return (REQUEST_STATUSES as string[]).includes(value)
}

interface AdminDemandesPageProps {
  searchParams: Promise<{ q?: string; status?: string; attention?: string }>
}

const PAGE_LIMIT = 100

// Vue d'ensemble en lecture seule : is_admin() donne déjà un accès complet
// à travel_requests/travel_proposals/travel_payments/disputes (aucune
// nouvelle policy nécessaire). Aucune action ici — chaque ligne renvoie
// vers /jibli/[id] (contenu mission, déjà lisible par un admin via RLS) ou
// vers l'écran admin qui a le pouvoir d'agir (/admin/litiges/[id],
// /admin/jibli-paiements), jamais une action dupliquée sur cette page.
//
// "Nécessite attention" n'est PAS une colonne : calculé ici (paiement
// awaiting_verification OU litige open), pas un statut de travel_requests
// (qui n'en a que 5 : open/matched/in_transit/completed/cancelled — "en
// négociation"/"litigieuse" ne sont pas des valeurs de cette colonne).
//
// Même choix pragmatique que /admin/litiges et /admin/flouci-incidents :
// recherche filtrée côté serveur après coup (pas en base), volume actuel
// très faible (5 demandes en prod au moment d'écrire ceci).
export default async function AdminDemandesPage({ searchParams }: AdminDemandesPageProps) {
  const { q = '', status = 'all', attention } = await searchParams
  const wantsAttention = attention === '1'
  const supabase = await createClient()

  let query = supabase
    .from('travel_requests')
    .select('id, item_description, client_id, accepted_proposal_id, status, budget_max, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT)
  if (isRequestStatus(status)) query = query.eq('status', status)
  const { data: requests, error } = await query

  const requestIds = (requests ?? []).map((r) => r.id)
  const clientIds = Array.from(new Set((requests ?? []).map((r) => r.client_id)))
  const proposalIds = Array.from(
    new Set((requests ?? []).map((r) => r.accepted_proposal_id).filter((id): id is string => !!id))
  )

  const [{ data: clients }, { data: acceptedProposals }, { data: payments }, { data: openDisputes }] = await Promise.all([
    clientIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    proposalIds.length
      ? supabase.from('travel_proposals').select('id, request_id, voyageur_id, item_price, delivery_fee').in('id', proposalIds)
      : Promise.resolve({ data: [] as { id: string; request_id: string; voyageur_id: string; item_price: number; delivery_fee: number }[] }),
    requestIds.length
      ? supabase.from('travel_payments').select('request_id, amount, status').in('request_id', requestIds)
      : Promise.resolve({ data: [] as { request_id: string; amount: number; status: string }[] }),
    requestIds.length
      ? supabase.from('disputes').select('id, travel_request_id').in('travel_request_id', requestIds).eq('status', 'open')
      : Promise.resolve({ data: [] as { id: string; travel_request_id: string }[] }),
  ])

  const clientNameById = new Map((clients ?? []).map((c) => [c.id, c.full_name]))
  const proposalById = new Map((acceptedProposals ?? []).map((p) => [p.id, p]))
  const voyageurIds = Array.from(new Set((acceptedProposals ?? []).map((p) => p.voyageur_id)))
  const { data: voyageurs } = voyageurIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', voyageurIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const voyageurNameById = new Map((voyageurs ?? []).map((v) => [v.id, v.full_name]))
  const paymentByRequest = new Map((payments ?? []).map((p) => [p.request_id, p]))
  const openDisputeByRequest = new Map((openDisputes ?? []).map((d) => [d.travel_request_id, d.id]))

  const rows = (requests ?? []).map((r) => {
    const proposal = r.accepted_proposal_id ? proposalById.get(r.accepted_proposal_id) : undefined
    const voyageurName = proposal ? (voyageurNameById.get(proposal.voyageur_id) ?? 'Voyageur') : null
    const payment = paymentByRequest.get(r.id)
    const disputeId = openDisputeByRequest.get(r.id) ?? null
    // Montant réel dès qu'un paiement ou une proposition acceptée existe,
    // sinon budget max du client — simple estimation, jamais un montant
    // fixé par la plateforme (même logique que rewardBasis sur
    // /jibli/[id]), donc toujours étiqueté "(budget max)" pour ne pas
    // laisser croire à un montant engagé.
    const amount = payment?.amount ?? (proposal ? proposal.item_price + proposal.delivery_fee : r.budget_max)
    const isRealAmount = Boolean(payment || proposal)
    const needsAttention = payment?.status === 'awaiting_verification' || disputeId !== null

    return {
      id: r.id,
      itemDescription: r.item_description,
      status: r.status,
      createdAt: r.created_at,
      clientName: clientNameById.get(r.client_id) ?? 'Client',
      voyageurName,
      amount,
      isRealAmount,
      paymentPending: payment?.status === 'awaiting_verification',
      disputeId,
      needsAttention,
    }
  })

  const needle = q.trim().toLowerCase()
  const filtered = rows.filter((r) => {
    if (wantsAttention && !r.needsAttention) return false
    if (!needle) return true
    return (
      r.itemDescription.toLowerCase().includes(needle) ||
      r.clientName.toLowerCase().includes(needle) ||
      (r.voyageurName ?? '').toLowerCase().includes(needle)
    )
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Package className="h-6 w-6 text-brand-600" aria-hidden />
        Demandes
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Vue d&apos;ensemble des missions Jibli, tous statuts confondus — lecture seule.
      </p>

      <div className="mt-6">
        <RequestSearchFilters defaultQuery={q} defaultStatus={status} defaultAttention={wantsAttention} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les demandes.</p>}

      {!error && filtered.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Package className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune demande ne correspond à ces critères.</p>
        </div>
      )}

      {!error && filtered.length > 0 && (
        <div className="mt-6 space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/jibli/${r.id}`} className="truncate font-medium text-slate-900 hover:underline">
                    {r.itemDescription}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {r.clientName}
                    {r.voyageurName && ` → ${r.voyageurName}`} · {new Date(r.createdAt).toLocaleDateString('fr-TN')}
                  </p>
                </div>
                <TravelRequestStatusBadge status={r.status} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700">
                  {formatTND(r.amount)}
                  {!r.isRealAmount && <span className="ml-1 text-xs font-normal text-slate-400">(budget max)</span>}
                </span>

                {r.paymentPending && (
                  <Link href="/admin/jibli-paiements">
                    <Badge tone="warning" className="gap-1">
                      <Wallet className="h-3 w-3" aria-hidden />
                      Paiement en attente
                    </Badge>
                  </Link>
                )}

                {r.disputeId && (
                  <Link href={`/admin/litiges/${r.disputeId}`}>
                    <Badge tone="danger" className="gap-1">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Litige ouvert
                    </Badge>
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
