import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertOctagon, User, Package, Receipt, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { FlouciIncidentStatusBadge } from '@/components/admin/FlouciIncidentStatusBadge'
import { FlouciReverifyButton } from '@/components/admin/FlouciReverifyButton'
import { ResolutionForm } from '@/components/admin/ResolutionForm'
import { resolveFlouciIncident } from '../actions'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { formatTND } from '@/lib/format'
import { Heading } from '@/components/ui/Typography'

interface AdminFlouciIncidentDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminFlouciIncidentDetailPage({ params }: AdminFlouciIncidentDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: incident, error } = await supabase.from('flouci_payment_incidents').select('*').eq('id', id).single()
  if (error || !incident) notFound()

  const { data: travelRequest } = await supabase
    .from('travel_requests')
    .select('id, item_description, status')
    .eq('id', incident.travel_request_id)
    .maybeSingle()

  // La proposition Flouci a échoué à être acceptée, mais peut très bien
  // avoir été acceptée depuis (par un autre paiement) ou être toujours en
  // attente — statut affiché tel quel, pas d'hypothèse.
  const { data: proposal } = await supabase
    .from('travel_proposals')
    .select('status')
    .eq('id', incident.travel_proposal_id)
    .maybeSingle()

  const { data: payment } = await supabase
    .from('travel_payments')
    .select('status, payment_ref')
    .eq('request_id', incident.travel_request_id)
    .maybeSingle()

  const { data: client } = await supabase.from('profiles').select('full_name, email').eq('id', incident.client_id).single()

  const profileIds = [incident.resolved_by].filter((v): v is string => !!v)
  const { data: resolvers } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', profileIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const resolverById = new Map((resolvers ?? []).map((r) => [r.id, r.full_name]))

  // Ce même paiement a-t-il, malgré tout, fini par produire un
  // travel_payments avec ce payment_ref (ex: l'utilisateur a réessayé et ça
  // a fonctionné la 2e fois) ? Si oui, l'incident est probablement obsolète
  // — affiché comme information, la décision reste à l'admin.
  const alreadyProcessed = payment?.payment_ref === incident.flouci_payment_id

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/admin/flouci-incidents"
        className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline"
      >
        ← Paiements Flouci orphelins
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Heading level="h1" className="flex items-center gap-2">
          <AlertOctagon className="h-6 w-6 text-brand-600" aria-hidden />
          Incident Flouci
        </Heading>
        <FlouciIncidentStatusBadge status={incident.status} />
      </div>

      {alreadyProcessed && (
        <Alert tone="info" className="mt-4">
          Un paiement <strong>travel_payments</strong> existe pour cette mission avec la même référence Flouci
          ({incident.flouci_payment_id}) : ce paiement a probablement fini par être traité normalement (nouvelle
          tentative réussie). Vérifie avant de considérer ce cas comme réellement orphelin.
        </Alert>
      )}

      <Card className="mt-6">
        <Heading level="h3" as="h2" className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-500" aria-hidden />
          Paiement Flouci
        </Heading>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Référence Flouci</dt>
            <dd className="mt-0.5 font-mono text-slate-900">{incident.flouci_payment_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Montant</dt>
            <dd className="mt-0.5 text-slate-900">{formatTND(incident.amount)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Statut côté Livrily</dt>
            <dd className="mt-0.5 text-slate-900">
              {payment ? `travel_payments existe (${payment.status})` : 'Aucun travel_payments — transaction non finalisée'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Erreur capturée</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">{incident.error_message}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <FlouciReverifyButton flouciPaymentId={incident.flouci_payment_id} />
        </div>
      </Card>

      <Card className="mt-4">
        <Heading level="h3" as="h2" className="flex items-center gap-2">
          <User className="h-4 w-4 text-slate-500" aria-hidden />
          Client
        </Heading>
        <div className="mt-2 text-sm">
          <p className="text-slate-900">{client?.full_name ?? 'Utilisateur'}</p>
          <p className="text-slate-500">{client?.email}</p>
        </div>
      </Card>

      <Card className="mt-4">
        <Heading level="h3" as="h2" className="flex items-center gap-2">
          <Package className="h-4 w-4 text-slate-500" aria-hidden />
          Mission concernée
        </Heading>
        {travelRequest ? (
          <div className="mt-2 space-y-1 text-sm">
            <Link href={`/jibli/${travelRequest.id}`} className="font-medium text-brand-700 hover:underline">
              {travelRequest.item_description}
            </Link>
            <p className="text-slate-500">Statut de la mission : {travelRequest.status}</p>
            <p className="text-slate-500">Statut de la proposition Flouci : {proposal?.status ?? 'introuvable'}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Mission introuvable.</p>
        )}
      </Card>

      <Card className="mt-4">
        <Heading level="h3" as="h2" className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
          Détection
        </Heading>
        <p className="mt-2 text-xs text-slate-400">
          Incident capturé le {new Date(incident.created_at).toLocaleString('fr-TN')}
        </p>
      </Card>

      {incident.status === 'resolved' ? (
        <Alert tone="success" className="mt-4">
          <p className="font-semibold">Incident résolu</p>
          <p className="mt-1">{incident.resolution_note}</p>
          <p className="mt-2 text-xs opacity-80">
            Par {resolverById.get(incident.resolved_by ?? '') ?? 'un admin'} le{' '}
            {incident.resolved_at ? new Date(incident.resolved_at).toLocaleString('fr-TN') : '—'}
          </p>
        </Alert>
      ) : (
        <Card className="mt-4">
          <Heading level="h3" as="h2" className="mb-3">Résoudre cet incident</Heading>
          {/* .bind() sur la vraie référence server action, PAS une arrow
              function fermant sur incident.id : "Functions cannot be passed
              directly to Client Components unless..." — seule une vraie
              référence 'use server' (ou son .bind()) traverse la frontière
              RSC, une closure ordinaire ne le peut pas même si elle
              n'appelle qu'un vrai server action dans son corps. Reproduit
              en direct (500 sur /admin/2fa avec ce même pattern), trou
              resté invisible ici car jamais rendu via un vrai navigateur
              (seulement testé au niveau RPC/DB). */}
          <ResolutionForm
            onResolve={resolveFlouciIncident.bind(null, incident.id)}
            confirmMessage="Confirmer la résolution de cet incident Flouci ?"
          />
        </Card>
      )}
    </main>
  )
}
