import { Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { WalletDepositActions } from '@/components/admin/WalletDepositActions'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'

// Mirror de /admin/boost-paiements — liste simple, pas un dashboard.
// Contrairement au boost (rapprochement comptable a posteriori,
// boosted_until déjà posé) : ici la vérification EST le geste qui crédite
// réellement wallet_balance (trigger credit_wallet_balance_on_deposit, cf.
// schema.sql) — un dépôt en attente n'a encore aucun effet sur le solde
// affiché au client.
export default async function PortefeuillePaiementsPage() {
  const supabase = await createClient()

  const { data: deposits, error } = await supabase
    .from('wallet_deposits')
    .select('*')
    .eq('status', 'awaiting_verification')
    .order('created_at', { ascending: true })

  const profileIds = Array.from(new Set((deposits ?? []).map((d) => d.profile_id)))
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', profileIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  // Preuves de virement dans un bucket privé : URL signées à durée limitée,
  // même précaution que /admin/boost-paiements/jibli-paiements.
  const signedUrls = new Map<string, string>()
  for (const deposit of deposits ?? []) {
    if (!deposit.payment_proof_url) continue
    const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(deposit.payment_proof_url, 3600)
    if (data?.signedUrl) signedUrls.set(deposit.id, data.signedUrl)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Wallet className="h-6 w-6 text-brand-600" aria-hidden />
        Dépôts portefeuille en attente
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Virements vers le solde interne en attente de vérification manuelle.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les dépôts.</p>}

      {!error && deposits && deposits.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Wallet className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun dépôt en attente de vérification.</p>
        </div>
      )}

      {!error && deposits && deposits.length > 0 && (
        <div className="mt-6 space-y-4">
          {deposits.map((deposit) => {
            const profile = profileById.get(deposit.profile_id)
            return (
              <Card key={deposit.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{profile?.full_name ?? 'Utilisateur'}</p>
                    <p className="text-xs text-slate-500">{profile?.email ?? ''}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Demandé le {new Date(deposit.created_at).toLocaleString('fr-TN')}
                    </p>
                  </div>
                  <p className="text-xl font-bold tracking-tight text-slate-900">{formatTND(deposit.amount)}</p>
                </div>

                {signedUrls.has(deposit.id) && (
                  // eslint-disable-next-line @next/next/no-img-element -- preuve utilisateur via URL signée temporaire
                  <img
                    src={signedUrls.get(deposit.id)}
                    alt="Preuve de virement"
                    className="mt-3 max-h-64 rounded-lg border border-slate-200 object-contain"
                  />
                )}

                <div className="mt-4">
                  <WalletDepositActions depositId={deposit.id} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
