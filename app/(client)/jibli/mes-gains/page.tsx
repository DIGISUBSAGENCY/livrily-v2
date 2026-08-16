import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { WithdrawalStatusBadge } from '@/components/travel/WithdrawalStatusBadge'
import { RequestWithdrawalButton } from '@/components/travel/RequestWithdrawalButton'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mes gains',
  description: 'Tes gains de voyageur, séquestrés et disponibles, sur Livrily.',
  noIndex: true,
})

// Deux sections volontairement séparées (requêtes distinctes, jamais
// sommées ensemble) : "en attente" (escrowed, pas encore libéré par le
// client) et "disponible" (released, net des retraits déjà demandés).
export default async function MesGainsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/mes-gains')

  const { data: acceptedProposals } = await supabase
    .from('travel_proposals')
    .select('request_id')
    .eq('voyageur_id', user.id)
    .eq('status', 'accepted')

  const requestIds = (acceptedProposals ?? []).map((p) => p.request_id)

  const { data: escrowedPayments } = requestIds.length
    ? await supabase.from('travel_payments').select('*').in('request_id', requestIds).eq('status', 'escrowed')
    : { data: [] }

  const escrowedTotal = (escrowedPayments ?? []).reduce(
    (sum, p) => sum + (p.amount - p.commission_amount),
    0
  )

  const { data: availableBalance } = await supabase.rpc('travel_voyageur_balance', {
    p_voyageur_id: user.id,
  })

  const { data: withdrawals } = await supabase
    .from('withdrawal_requests')
    .select('*')
    .eq('voyageur_id', user.id)
    .order('requested_at', { ascending: false })

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Jibli chay men l&apos;a5er
      </Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Wallet className="h-6 w-6 text-brand-600" aria-hidden />
        Mes gains
      </h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-500">En attente (séquestré)</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{formatTND(escrowedTotal)}</p>
          <p className="mt-1 text-xs text-slate-400">
            Bloqué par la plateforme jusqu&apos;à ce que le client confirme la réception.
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Disponible</p>
          <p className="mt-1 text-2xl font-bold text-brand-600">{formatTND(availableBalance ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-400">Libéré, net des retraits déjà demandés.</p>
        </Card>
      </div>

      {(availableBalance ?? 0) > 0 && (
        <div className="mt-4">
          <RequestWithdrawalButton />
        </div>
      )}

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Historique des retraits</h2>
      {(!withdrawals || withdrawals.length === 0) && (
        <p className="text-sm text-slate-500">Aucune demande de retrait pour l&apos;instant.</p>
      )}
      {withdrawals && withdrawals.length > 0 && (
        <div className="space-y-3">
          {withdrawals.map((withdrawal) => (
            <Card key={withdrawal.id} className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{formatTND(withdrawal.amount)}</p>
                <p className="text-xs text-slate-500">
                  {new Date(withdrawal.requested_at).toLocaleString('fr-TN')}
                </p>
              </div>
              <WithdrawalStatusBadge status={withdrawal.status} />
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
