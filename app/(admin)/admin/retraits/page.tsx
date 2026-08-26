import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { WithdrawalActions } from '@/components/admin/WithdrawalActions'
import { WithdrawalStatusBadge } from '@/components/travel/WithdrawalStatusBadge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'

// Traitement manuel des demandes de retrait voyageur (crowd-shipping) —
// jusqu'ici aucune UI admin n'existait pour ça (cf. commentaire dans
// schema.sql sur withdrawal_requests_update_admin_only), alors que les
// voyageurs peuvent déjà en soumettre depuis /jibli/mes-gains. Même
// structure que /admin/jibli-paiements.
export default async function AdminRetraitsPage() {
  const supabase = await createClient()

  const { data: withdrawals, error } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })

  const voyageurIds = Array.from(new Set((withdrawals ?? []).map((w) => w.voyageur_id)))
  const { data: voyageurs } = voyageurIds.length
    ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', voyageurIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] }
  const voyageurById = new Map((voyageurs ?? []).map((v) => [v.id, v]))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Wallet className="h-6 w-6 text-brand-600" aria-hidden />
        Retraits voyageurs
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Demandes de retrait en attente de traitement manuel (virement hors app).
      </p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les demandes de retrait.</p>}

      {!error && withdrawals && withdrawals.length === 0 && (
        <EmptyState icon={Wallet}>
          <p>Aucune demande de retrait en attente.</p>
        </EmptyState>
      )}

      {!error && withdrawals && withdrawals.length > 0 && (
        <div className="mt-6 space-y-4">
          {withdrawals.map((withdrawal) => {
            const voyageur = voyageurById.get(withdrawal.voyageur_id)
            return (
              <Card key={withdrawal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{voyageur?.full_name ?? 'Voyageur'}</p>
                    <p className="text-xs text-slate-500">{voyageur?.email ?? voyageur?.phone ?? ''}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Demandé le {new Date(withdrawal.requested_at).toLocaleString('fr-TN')}
                    </p>
                  </div>
                  <WithdrawalStatusBadge status={withdrawal.status} />
                </div>

                <p className="mt-3 text-xl font-bold tracking-tight text-slate-900">{formatTND(withdrawal.amount)}</p>

                <div className="mt-4">
                  <WithdrawalActions withdrawalId={withdrawal.id} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
