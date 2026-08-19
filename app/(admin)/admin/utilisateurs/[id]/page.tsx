import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Wallet, Package, Plane, Luggage, Receipt } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { UserStatusToggle } from '@/components/admin/UserStatusToggle'
import { UserProfileEditForm } from '@/components/admin/UserProfileEditForm'
import { WalletAdjustmentForm } from '@/components/admin/WalletAdjustmentForm'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { WithdrawalStatusBadge } from '@/components/travel/WithdrawalStatusBadge'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { formatTND } from '@/lib/format'
import { COUNTRIES } from '@/lib/constants/countries'

interface UserDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ warning?: string }>
}

const walletReasonLabels: Record<string, string> = {
  referral_referrer: 'Parrainage — filleul livré',
  referral_referred: 'Parrainage — bienvenue',
  checkout_redemption: 'Utilisé à la commande',
}

const HISTORY_LIMIT = 20

export default async function AdminUserDetailPage({ params, searchParams }: UserDetailPageProps) {
  const { id } = await params
  const { warning } = await searchParams
  const supabase = await createClient()

  const { data: user, error } = await supabase.from('profiles').select('*').eq('id', id).eq('role', 'client').single()

  if (error || !user) {
    notFound()
  }

  const [
    { data: orders },
    { data: travelRequests },
    { data: proposals },
    { data: walletCredits },
    { data: withdrawals },
    { data: adjustments },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, commerce_id, total, status, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('travel_requests')
      .select('id, item_description, status, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('travel_proposals')
      .select('id, request_id, item_price, delivery_fee, status, created_at')
      .eq('voyageur_id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('wallet_credits')
      .select('id, amount, reason, created_at')
      .eq('profile_id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('withdrawal_requests')
      .select('id, amount, status, requested_at')
      .eq('voyageur_id', id)
      .order('requested_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('wallet_adjustments')
      .select('id, amount, reason, created_by, created_at')
      .eq('profile_id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  ])

  const commerceIds = Array.from(new Set((orders ?? []).map((o) => o.commerce_id)))
  const { data: commerces } = commerceIds.length
    ? await supabase.from('commerces').select('id, name').in('id', commerceIds)
    : { data: [] as { id: string; name: string }[] }
  const commerceNameById = new Map((commerces ?? []).map((c) => [c.id, c.name]))

  const requestIds = Array.from(new Set((proposals ?? []).map((p) => p.request_id)))
  const { data: requests } = requestIds.length
    ? await supabase.from('travel_requests').select('id, item_description').in('id', requestIds)
    : { data: [] as { id: string; item_description: string }[] }
  const requestDescById = new Map((requests ?? []).map((r) => [r.id, r.item_description]))

  // Dernière connexion : uniquement dispo via l'API Admin Auth (auth.users,
  // hors de portée de postgREST/RLS) — un seul appel car on est sur le
  // détail d'UN utilisateur, jamais sur la liste (N+1 sinon).
  let lastSignInAt: string | null = null
  try {
    const adminClient = createAdminClient()
    const { data: authUser } = await adminClient.auth.admin.getUserById(id)
    lastSignInAt = authUser.user?.last_sign_in_at ?? null
  } catch {
    lastSignInAt = null
  }

  const countryLabel = COUNTRIES.find((c) => c.value === user.country)?.label ?? user.country ?? '—'

  const adjusterIds = Array.from(new Set((adjustments ?? []).map((a) => a.created_by)))
  const { data: adjusters } = adjusterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', adjusterIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const adjusterNameById = new Map((adjusters ?? []).map((a) => [a.id, a.full_name ?? 'Admin']))

  // Deux historiques séparés, VOLONTAIREMENT non fusionnés : wallet_credits
  // et wallet_adjustments modifient tous les deux profiles.wallet_balance
  // (le solde parrainage affiché dans la carte ci-dessous), alors que
  // withdrawal_requests n'y touche jamais — travel_voyageur_balance() (gains
  // crowd-shipping, /jibli/mes-gains) est recalculée à la volée depuis
  // travel_payments/withdrawal_requests, indépendamment de wallet_balance.
  // Les mélanger dans un même "Historique du solde" laisserait croire à
  // tort qu'ils affectent le même solde.
  const walletHistory = [
    ...(walletCredits ?? []).map((w) => ({
      id: `credit-${w.id}`,
      date: w.created_at,
      label: walletReasonLabels[w.reason] ?? w.reason,
      amount: w.amount,
    })),
    ...(adjustments ?? []).map((a) => ({
      id: `adjustment-${a.id}`,
      date: a.created_at,
      label: `Ajustement admin (${adjusterNameById.get(a.created_by) ?? 'Admin'}) — ${a.reason}`,
      amount: a.amount,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const withdrawalHistory = (withdrawals ?? [])
    .map((w) => ({
      id: w.id,
      date: w.requested_at,
      amount: w.amount,
      status: w.status,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin/utilisateurs" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Utilisateurs
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{user.full_name ?? 'Sans nom'}</h1>
        <UserStatusToggle userId={user.id} initialIsActive={user.is_active} />
      </div>

      {warning === 'profil_incomplet' && (
        <Alert tone="warning" className="mt-4">
          Compte créé, mais téléphone/adresse/pays n&apos;ont pas pu être enregistrés — complète-les
          ci-dessous.
        </Alert>
      )}

      <Card className="mt-6">
        <UserProfileEditForm user={user} countryLabel={countryLabel} />
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
          Dernière connexion : {lastSignInAt ? new Date(lastSignInAt).toLocaleString('fr-TN') : '—'}
        </p>
      </Card>

      <Card className="mt-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Wallet className="h-8 w-8 text-brand-600" aria-hidden />
            <div>
              <p className="text-2xl font-bold tracking-tight text-brand-700">{formatTND(user.wallet_balance)}</p>
              <p className="text-sm text-slate-500">Solde parrainage (wallet_balance)</p>
            </div>
          </div>
        </div>
        <WalletAdjustmentForm userId={user.id} />
      </Card>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Package className="h-5 w-5 text-slate-500" aria-hidden />
          Commandes ({orders?.length ?? 0})
        </h2>
        {(!orders || orders.length === 0) && <p className="text-sm text-slate-500">Aucune commande.</p>}
        {orders && orders.length > 0 && (
          <Card className="p-3">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 py-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-slate-900">{commerceNameById.get(order.commerce_id) ?? 'Commerce'}</p>
                  <p className="text-xs text-slate-400">{new Date(order.created_at).toLocaleDateString('fr-TN')}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="font-medium text-slate-900">{formatTND(order.total)}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Plane className="h-5 w-5 text-slate-500" aria-hidden />
          Demandes Jibli postées ({travelRequests?.length ?? 0})
        </h2>
        {(!travelRequests || travelRequests.length === 0) && <p className="text-sm text-slate-500">Aucune demande.</p>}
        {travelRequests && travelRequests.length > 0 && (
          <Card className="p-3">
            {travelRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 py-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-slate-900">{request.item_description}</p>
                  <p className="text-xs text-slate-400">{new Date(request.created_at).toLocaleDateString('fr-TN')}</p>
                </div>
                <TravelRequestStatusBadge status={request.status} />
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Luggage className="h-5 w-5 text-slate-500" aria-hidden />
          Propositions en tant que voyageur ({proposals?.length ?? 0})
        </h2>
        {(!proposals || proposals.length === 0) && <p className="text-sm text-slate-500">Aucune proposition.</p>}
        {proposals && proposals.length > 0 && (
          <Card className="p-3">
            {proposals.map((proposal) => (
              <div key={proposal.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 py-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-slate-900">{requestDescById.get(proposal.request_id) ?? 'Demande'}</p>
                  <p className="text-xs text-slate-400">{new Date(proposal.created_at).toLocaleDateString('fr-TN')}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="font-medium text-slate-900">{formatTND(proposal.item_price + proposal.delivery_fee)}</span>
                  <TravelProposalStatusBadge status={proposal.status} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Receipt className="h-5 w-5 text-slate-500" aria-hidden />
          Historique solde parrainage ({walletHistory.length})
        </h2>
        {walletHistory.length === 0 && <p className="text-sm text-slate-500">Aucune transaction.</p>}
        {walletHistory.length > 0 && (
          <Card className="p-3">
            {walletHistory.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 py-2 text-sm last:border-0">
                <div>
                  <p className="text-slate-700">{tx.label}</p>
                  <p className="text-xs text-slate-400">{new Date(tx.date).toLocaleDateString('fr-TN')}</p>
                </div>
                <span className={tx.amount >= 0 ? 'font-medium text-brand-700' : 'font-medium text-slate-500'}>
                  {tx.amount >= 0 ? '+' : ''}
                  {formatTND(tx.amount)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
          <Wallet className="h-5 w-5 text-slate-500" aria-hidden />
          Retraits crowd-shipping ({withdrawalHistory.length})
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          N&apos;affecte pas le solde parrainage ci-dessus — calculé séparément depuis les paiements
          crowd-shipping libérés (travel_voyageur_balance).
        </p>
        {withdrawalHistory.length === 0 && <p className="text-sm text-slate-500">Aucun retrait.</p>}
        {withdrawalHistory.length > 0 && (
          <Card className="p-3">
            {withdrawalHistory.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 py-2 text-sm last:border-0">
                <p className="text-xs text-slate-400">{new Date(w.date).toLocaleDateString('fr-TN')}</p>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{formatTND(w.amount)}</span>
                  <WithdrawalStatusBadge status={w.status} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </main>
  )
}
