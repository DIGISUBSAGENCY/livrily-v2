import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, User, Plane, Package, Wallet, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { DisputeStatusBadge } from '@/components/travel/DisputeStatusBadge'
import { ResolutionForm } from '@/components/admin/ResolutionForm'
import { resolveDispute } from '../actions'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { formatTND } from '@/lib/format'

interface AdminLitigeDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminLitigeDetailPage({ params }: AdminLitigeDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: dispute, error } = await supabase.from('disputes').select('*').eq('id', id).single()
  if (error || !dispute) notFound()

  const { data: travelRequest } = await supabase
    .from('travel_requests')
    .select('id, item_description, item_url, origin_country, destination_city, budget_max, status, client_id, accepted_proposal_id, created_at')
    .eq('id', dispute.travel_request_id)
    .single()

  // Voyageur : uniquement s'il y a une proposition acceptée (le litige peut
  // avoir été ouvert avant qu'un voyageur soit sélectionné).
  const { data: acceptedProposal } = travelRequest?.accepted_proposal_id
    ? await supabase.from('travel_proposals').select('voyageur_id, item_price, delivery_fee').eq('id', travelRequest.accepted_proposal_id).single()
    : { data: null }

  const profileIds = [dispute.opened_by, travelRequest?.client_id, acceptedProposal?.voyageur_id].filter(
    (v): v is string => !!v
  )
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', profileIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const { data: payment } = await supabase
    .from('travel_payments')
    .select('amount, commission_amount, status, payment_method')
    .eq('request_id', dispute.travel_request_id)
    .maybeSingle()

  const opener = profileById.get(dispute.opened_by)
  const client = travelRequest?.client_id ? profileById.get(travelRequest.client_id) : null
  const voyageur = acceptedProposal?.voyageur_id ? profileById.get(acceptedProposal.voyageur_id) : null

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin/litiges" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Litiges
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <AlertTriangle className="h-6 w-6 text-brand-600" aria-hidden />
          Litige
        </h1>
        <DisputeStatusBadge status={dispute.status} />
      </div>

      <Card className="mt-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Package className="h-4 w-4 text-slate-500" aria-hidden />
          Mission concernée
        </h2>
        {travelRequest ? (
          <div className="mt-3 space-y-1 text-sm">
            <Link href={`/jibli/${travelRequest.id}`} className="font-medium text-brand-700 hover:underline">
              {travelRequest.item_description}
            </Link>
            <p className="text-slate-500">
              {travelRequest.origin_country} → {travelRequest.destination_city} · Budget max {formatTND(travelRequest.budget_max)}
            </p>
            <p className="text-slate-500">Statut de la mission : {travelRequest.status}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Mission introuvable (supprimée ?).</p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <User className="h-4 w-4 text-slate-500" aria-hidden />
          Parties concernées
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">A ouvert le litige</dt>
            <dd className="mt-0.5 text-slate-900">{opener?.full_name ?? 'Utilisateur'}</dd>
            <dd className="text-xs text-slate-400">{opener?.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Client</dt>
            <dd className="mt-0.5 text-slate-900">{client?.full_name ?? '—'}</dd>
            <dd className="text-xs text-slate-400">{client?.email}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              <Plane className="h-3 w-3" aria-hidden /> Voyageur
            </dt>
            <dd className="mt-0.5 text-slate-900">{voyageur?.full_name ?? 'Aucun voyageur accepté'}</dd>
            <dd className="text-xs text-slate-400">{voyageur?.email}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Wallet className="h-4 w-4 text-slate-500" aria-hidden />
          Paiement associé
        </h2>
        {payment ? (
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-slate-500">Montant</p>
              <p className="font-medium text-slate-900">{formatTND(payment.amount)}</p>
            </div>
            <div>
              <p className="text-slate-500">Commission</p>
              <p className="font-medium text-slate-900">{formatTND(payment.commission_amount)}</p>
            </div>
            <div>
              <p className="text-slate-500">Méthode</p>
              <p className="font-medium text-slate-900">{payment.payment_method}</p>
            </div>
            <div>
              <p className="text-slate-500">Statut escrow</p>
              <p className="font-medium text-slate-900">{payment.status}</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Aucun paiement enregistré pour cette mission (proposition pas encore acceptée).</p>
        )}
      </Card>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
          Raison du litige
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{dispute.reason}</p>
        <p className="mt-3 text-xs text-slate-400">
          Ouvert le {new Date(dispute.created_at).toLocaleString('fr-TN')}
        </p>
      </Card>

      {dispute.status === 'resolved' ? (
        <Alert tone="success" className="mt-4">
          <p className="font-semibold">Litige résolu</p>
          <p className="mt-1">{dispute.resolution_note}</p>
          <p className="mt-2 text-xs opacity-80">
            Par {profileById.get(dispute.resolved_by ?? '')?.full_name ?? 'un admin'} le{' '}
            {dispute.resolved_at ? new Date(dispute.resolved_at).toLocaleString('fr-TN') : '—'}
          </p>
        </Alert>
      ) : (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold text-slate-900">Résoudre ce litige</h2>
          <ResolutionForm
            onResolve={(note) => resolveDispute(dispute.id, note)}
            confirmMessage="Confirmer la résolution de ce litige ?"
          />
        </Card>
      )}
    </main>
  )
}
