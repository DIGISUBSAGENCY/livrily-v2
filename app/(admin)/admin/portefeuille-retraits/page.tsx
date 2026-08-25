import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { WalletWithdrawalActions } from '@/components/admin/WalletWithdrawalActions'
import { WithdrawalStatusBadge } from '@/components/travel/WithdrawalStatusBadge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'

// Mirror de /admin/retraits (système B, gains voyageur) — même structure,
// mais sur wallet_withdrawals (profile_id, pas voyageur_id) : n'importe
// quel profil avec un solde peut demander un retrait, pas seulement un
// voyageur avec des gains de mission.
export default async function PortefeuilleRetraitsPage() {
  const supabase = await createClient()

  const { data: withdrawals, error } = await supabase
    .from('wallet_withdrawals')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })

  const profileIds = Array.from(new Set((withdrawals ?? []).map((w) => w.profile_id)))
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', profileIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Wallet className="h-6 w-6 text-brand-600" aria-hidden />
        Retraits portefeuille
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Demandes de retrait du solde interne en attente de traitement manuel (virement hors app).
      </p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les demandes de retrait.</p>}

      {!error && withdrawals && withdrawals.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Wallet className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune demande de retrait en attente.</p>
        </div>
      )}

      {!error && withdrawals && withdrawals.length > 0 && (
        <div className="mt-6 space-y-4">
          {withdrawals.map((withdrawal) => {
            const profile = profileById.get(withdrawal.profile_id)
            return (
              <Card key={withdrawal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{profile?.full_name ?? 'Utilisateur'}</p>
                    <p className="text-xs text-slate-500">{profile?.email ?? profile?.phone ?? ''}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Demandé le {new Date(withdrawal.requested_at).toLocaleString('fr-TN')}
                    </p>
                  </div>
                  <WithdrawalStatusBadge status={withdrawal.status} />
                </div>

                <p className="mt-3 text-xl font-bold tracking-tight text-slate-900">{formatTND(withdrawal.amount)}</p>

                <div className="mt-4">
                  <WalletWithdrawalActions withdrawalId={withdrawal.id} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
