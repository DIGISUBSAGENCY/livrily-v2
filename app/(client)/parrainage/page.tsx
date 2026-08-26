import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ReferralCodeCard } from '@/components/account/ReferralCodeCard'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'
import { getSiteUrl } from '@/lib/site'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Parrainage',
  description: 'Ton code de parrainage et ton historique de récompenses Livrily.',
  noIndex: true,
})

const reasonLabels: Record<string, string> = {
  referral_referrer: 'Parrainage — filleul livré',
  referral_referred: 'Parrainage — bienvenue',
  checkout_redemption: 'Utilisé à la commande',
}

// Page simple, sans onglets — le Portefeuille (solde, dépôt, retrait,
// historiques) a déménagé sur /jibli/dashboard (chantier séparation
// Parrainage/Portefeuille), cette page ne parle plus que de parrainage.
// Séparation complète : le solde ne s'affiche plus ici du tout (décision
// explicite), même pas en lecture seule — pour ça, direction le Dashboard.
export default async function ParrainagePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/parrainage')

  const [{ data: profile }, { data: history }] = await Promise.all([
    supabase.from('profiles').select('referral_code').eq('id', user.id).single(),
    supabase.from('wallet_credits').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20),
  ])

  const siteUrl = getSiteUrl()
  const shareUrl = `${siteUrl}/signup?ref=${profile?.referral_code ?? ''}`

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Heading level="h1">Parrainage</Heading>

      <div className="mt-6 space-y-4">
        {profile?.referral_code && <ReferralCodeCard code={profile.referral_code} shareUrl={shareUrl} />}

        {history && history.length > 0 && (
          <Card>
            <Heading level="h3" as="h2" className="mb-2">Historique</Heading>
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
