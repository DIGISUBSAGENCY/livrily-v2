import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReferralCodeCard } from '@/components/account/ReferralCodeCard'
import { ParrainageTabs } from '@/components/account/ParrainageTabs'
import { WalletDepositForm } from '@/components/account/WalletDepositForm'
import { WalletDepositStatusBadge } from '@/components/account/WalletDepositStatusBadge'
import { WalletWithdrawalForm } from '@/components/account/WalletWithdrawalForm'
import { WithdrawalStatusBadge } from '@/components/travel/WithdrawalStatusBadge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'
import { getSiteUrl } from '@/lib/site'

export const metadata: Metadata = pageMetadata({
  title: 'Parrainage & portefeuille',
  description: 'Ton code de parrainage, ton solde et ton historique de crédits Livrily.',
  noIndex: true,
})

const reasonLabels: Record<string, string> = {
  referral_referrer: 'Parrainage — filleul livré',
  referral_referred: 'Parrainage — bienvenue',
  checkout_redemption: 'Utilisé à la commande',
}

// Mirror de flouciBannerMessages (jibli/[id]/page.tsx) — pas de cas
// "orphaned" ici : contrairement à accept_travel_proposal (peut échouer
// après paiement confirmé si la proposition a changé entre-temps),
// credit_wallet_deposit_flouci n'agit que sur des lignes entièrement
// contrôlées par ce chantier (wallet_deposits/wallet_balance), aucun état
// externe ne peut la faire échouer après coup.
const flouciBannerMessages: Record<string, { text: string; tone: string }> = {
  success: { text: 'Paiement Flouci confirmé — ton solde a été crédité.', tone: 'bg-brand-50 text-brand-700 border-brand-200' },
  failed: { text: 'Le paiement Flouci a échoué ou a été annulé.', tone: 'bg-red-50 text-red-700 border-red-200' },
  error: { text: 'Une erreur est survenue pendant la vérification du paiement Flouci.', tone: 'bg-red-50 text-red-700 border-red-200' },
  unknown: { text: 'Une erreur est survenue pendant la vérification du paiement Flouci.', tone: 'bg-red-50 text-red-700 border-red-200' },
}

interface ParrainagePageProps {
  searchParams: Promise<{ flouci?: string }>
}

export default async function ParrainagePage({ searchParams }: ParrainagePageProps) {
  const { flouci } = await searchParams
  const flouciBanner = flouci ? flouciBannerMessages[flouci] : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/parrainage')

  const [{ data: profile }, { data: history }, { data: bankInfo }, { data: deposits }, { data: withdrawals }] = await Promise.all([
    supabase.from('profiles').select('referral_code, wallet_balance').eq('id', user.id).single(),
    supabase.from('wallet_credits').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('bank_transfer_info').select('bank_name, account_holder, rib, flouci_phone').eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('wallet_deposits').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('wallet_withdrawals').select('*').eq('profile_id', user.id).order('requested_at', { ascending: false }).limit(20),
  ])

  const siteUrl = getSiteUrl()
  const shareUrl = `${siteUrl}/signup?ref=${profile?.referral_code ?? ''}`

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Parrainage & portefeuille</h1>

      {flouciBanner && (
        <div className={`mt-4 rounded-lg border p-3 text-sm ${flouciBanner.tone}`}>{flouciBanner.text}</div>
      )}

      {/* Chantier portefeuille interne, brique 4/N — les 2 sections
          (Parrainage / Portefeuille), jusqu'ici empilées verticalement
          (briques 1-3/N), séparées en onglets distincts. defaultTab :
          atterrit directement sur "Portefeuille" au retour d'un paiement
          Flouci (?flouci=...) — ce serait absurde de laisser l'utilisateur
          sur l'onglet Parrainage juste après avoir payé un dépôt. */}
      <ParrainageTabs
        defaultTab={flouci ? 'portefeuille' : 'parrainage'}
        parrainage={
          <>
            {profile?.referral_code && <ReferralCodeCard code={profile.referral_code} shareUrl={shareUrl} />}

            {history && history.length > 0 && (
              <Card>
                <h2 className="mb-2 font-semibold text-slate-900">Historique</h2>
                <ul className="divide-y divide-slate-100">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="text-slate-700">{reasonLabels[entry.reason] ?? entry.reason}</p>
                        <p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleDateString('fr-TN')}</p>
                      </div>
                      <span className={entry.amount >= 0 ? 'font-medium text-brand-700' : 'font-medium text-slate-500'}>
                        {entry.amount >= 0 ? '+' : ''}
                        {formatTND(entry.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        }
        portefeuille={
          <>
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Solde disponible</p>
                <p className="text-2xl font-bold text-brand-700">{formatTND(profile?.wallet_balance ?? 0)}</p>
              </div>
              {/* Ancien texte ("Applicable sur les frais de livraison au
                  checkout") faisait référence à un checkout qui n'existe
                  plus (rôle commerce retiré) — trouvé obsolète en
                  construisant la brique 1/N, corrigé à l'époque plutôt que
                  laissé à mentir sur ce que ce solde représente maintenant. */}
              <p className="max-w-[55%] text-right text-xs text-slate-400">Crédité par parrainage ou par dépôt.</p>
            </Card>

            <Card>
              <h2 className="mb-2 font-semibold text-slate-900">Déposer</h2>
              <WalletDepositForm bankInfo={bankInfo ?? null} />
            </Card>

            {deposits && deposits.length > 0 && (
              <Card>
                <h2 className="mb-2 font-semibold text-slate-900">Historique des dépôts</h2>
                <ul className="divide-y divide-slate-100">
                  {deposits.map((deposit) => (
                    <li key={deposit.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-700">{formatTND(deposit.amount)}</p>
                        <p className="text-xs text-slate-400">{new Date(deposit.created_at).toLocaleString('fr-TN')}</p>
                      </div>
                      <WalletDepositStatusBadge status={deposit.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card>
              <h2 className="mb-2 font-semibold text-slate-900">Retirer</h2>
              <WalletWithdrawalForm balance={profile?.wallet_balance ?? 0} />
            </Card>

            {withdrawals && withdrawals.length > 0 && (
              <Card>
                <h2 className="mb-2 font-semibold text-slate-900">Historique des retraits</h2>
                <ul className="divide-y divide-slate-100">
                  {withdrawals.map((withdrawal) => (
                    <li key={withdrawal.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-700">{formatTND(withdrawal.amount)}</p>
                        <p className="text-xs text-slate-400">{new Date(withdrawal.requested_at).toLocaleString('fr-TN')}</p>
                      </div>
                      <WithdrawalStatusBadge status={withdrawal.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        }
      />
    </main>
  )
}
