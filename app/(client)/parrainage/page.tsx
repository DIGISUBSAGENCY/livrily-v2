import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReferralCodeCard } from '@/components/account/ReferralCodeCard'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'

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

export default async function ParrainagePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/parrainage')

  const [{ data: profile }, { data: history }] = await Promise.all([
    supabase.from('profiles').select('referral_code, wallet_balance').eq('id', user.id).single(),
    supabase.from('wallet_credits').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20),
  ])

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const shareUrl = `${siteUrl}/signup?ref=${profile?.referral_code ?? ''}`

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Parrainage & portefeuille</h1>

      <div className="mt-6 space-y-4">
        {profile?.referral_code && <ReferralCodeCard code={profile.referral_code} shareUrl={shareUrl} />}

        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Solde disponible</p>
            <p className="text-2xl font-bold text-brand-700">{formatTND(profile?.wallet_balance ?? 0)}</p>
          </div>
          <p className="max-w-[55%] text-right text-xs text-slate-400">
            Applicable sur les frais de livraison au checkout.
          </p>
        </Card>

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
      </div>
    </main>
  )
}
