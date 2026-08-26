import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList, Tag, ArrowLeftRight, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IdentityBanner } from '@/components/account/IdentityBanner'
import { StatCard } from '@/components/ui/StatCard'
import { CountryFlowSection } from '@/components/travel/CountryFlowSection'
import { MyRequestsPreview } from '@/components/travel/MyRequestsPreview'
import { MyOffersPreview } from '@/components/travel/MyOffersPreview'
import { MyProposalsPreview } from '@/components/travel/MyProposalsPreview'
import { RecentActivity } from '@/components/notifications/RecentActivity'
import { WalletDepositForm } from '@/components/account/WalletDepositForm'
import { WalletDepositStatusBadge } from '@/components/account/WalletDepositStatusBadge'
import { WalletWithdrawalForm } from '@/components/account/WalletWithdrawalForm'
import { WithdrawalStatusBadge } from '@/components/travel/WithdrawalStatusBadge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { aggregateByCountry } from '@/lib/countryGeo'
import { getRecentNotifications } from '@/lib/notifications/actions'
import { Price } from '@/components/ui/Price'
import { Heading } from '@/components/ui/Typography'
import type { TravelRequestStatus } from '@/types/database'

export const metadata: Metadata = pageMetadata({
  title: 'Tableau de bord',
  description: 'Ton activité Jibli en un coup d’œil.',
  noIndex: true,
})

// Mirror de flouciBannerMessages (jibli/[id]/page.tsx, et ex-/parrainage
// avant le déménagement du Portefeuille ici) — pas de cas "orphaned" ici :
// contrairement à accept_travel_proposal (peut échouer après paiement
// confirmé si la proposition a changé entre-temps), credit_wallet_deposit_
// flouci n'agit que sur des lignes entièrement contrôlées par ce chantier
// (wallet_deposits/wallet_balance), aucun état externe ne peut la faire
// échouer après coup.
const flouciBannerMessages: Record<string, { text: string; tone: string }> = {
  success: { text: 'Paiement Flouci confirmé — ton solde a été crédité.', tone: 'bg-brand-50 text-brand-700 border-brand-200' },
  failed: { text: 'Le paiement Flouci a échoué ou a été annulé.', tone: 'bg-red-50 text-red-700 border-red-200' },
  error: { text: 'Une erreur est survenue pendant la vérification du paiement Flouci.', tone: 'bg-red-50 text-red-700 border-red-200' },
  unknown: { text: 'Une erreur est survenue pendant la vérification du paiement Flouci.', tone: 'bg-red-50 text-red-700 border-red-200' },
}

// Extrait le prénom de full_name ("Amir Ben Salah" → "Amir") — pas de champ
// first_name/last_name séparé dans profiles (un seul champ full_name), et
// aucun helper existant pour ça ailleurs dans le projet.
function firstName(fullName: string | null): string {
  const trimmed = fullName?.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

interface DashboardPageProps {
  searchParams: Promise<{ flouci?: string }>
}

// Nouvelle page dédiée — /jibli garde son bloc dashboard inline existant
// (IdentityBanner + DashboardStatCard + previews, réutilisés ici tels
// quels, cf. exploration) pour ne rien casser côté marketplace ; cette
// page-ci est un point d'entrée supplémentaire, plus complet (flux par
// pays, sections dédiées aux 3 types d'items, activité récente — briques
// suivantes de ce chantier).
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { flouci } = await searchParams
  const flouciBanner = flouci ? flouciBannerMessages[flouci] : null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/dashboard')

  // Requête directe (pas getIdentityStatus(), qui ne renvoie que le statut)
  // pour aussi récupérer rejection_reason — IdentityBanner l'affiche déjà
  // pleinement, même requête que le bloc dashboard existant sur /jibli.
  // wallet_balance : chantier séparation Parrainage/Portefeuille — le
  // Portefeuille (section tout en bas de cette page) en a besoin.
  const [{ data: profile }, { data: verification }, { data: bankInfo }, { data: deposits }, { data: withdrawals }] = await Promise.all([
    supabase.from('profiles').select('full_name, wallet_balance').eq('id', user.id).single(),
    supabase.from('identity_verifications').select('status, rejection_reason').eq('profile_id', user.id).maybeSingle(),
    supabase.from('bank_transfer_info').select('bank_name, account_holder, rib, flouci_phone').eq('is_active', true).limit(1).maybeSingle(),
    supabase.from('wallet_deposits').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('wallet_withdrawals').select('*').eq('profile_id', user.id).order('requested_at', { ascending: false }).limit(20),
  ])
  const identityStatus = verification?.status ?? 'unverified'
  const identityRejectionReason = verification?.rejection_reason ?? null

  // "Activité récente" — réutilise getRecentNotifications() telle quelle
  // (déjà en prod, cf. NotificationBell.tsx), pas un nouveau flux. Elle
  // renvoie déjà les 20 dernières triées ; 5 suffisent pour un aperçu.
  const recentNotifications = (await getRecentNotifications()).slice(0, 5)

  // Lignes complètes (pas juste un count) pour alimenter à la fois les
  // compteurs de l'en-tête ET les aperçus "Mes X" plus bas — même pattern
  // que le bloc dashboard existant sur /jibli (app/(client)/jibli/page.tsx),
  // pas réinventé ici. allMyRequests sert aussi de liste d'ids pour la
  // requête des propositions reçues juste après.
  const [{ data: allMyRequests }, { data: allMyOffers }, { data: allMyProposals }] = await Promise.all([
    supabase.from('travel_requests').select('*').eq('client_id', user.id).order('created_at', { ascending: false }),
    supabase.from('product_offers').select('*').eq('voyageur_id', user.id).order('created_at', { ascending: false }),
    supabase.from('travel_proposals').select('*').eq('voyageur_id', user.id).order('created_at', { ascending: false }),
  ])

  const requestsCount = allMyRequests?.length ?? 0
  const myRequestIds = (allMyRequests ?? []).map((r) => r.id)
  const offersCount = allMyOffers?.length ?? 0
  const sentProposalsCount = allMyProposals?.length ?? 0

  // Aperçus condensés (3 max, actifs uniquement) — même filtre que
  // MyRequestsPreview sur /jibli : 'completed'/'cancelled' exclus, du bruit
  // pas utile dans un aperçu.
  const myRequestsPreview = (allMyRequests ?? []).filter((r) => r.status !== 'completed' && r.status !== 'cancelled').slice(0, 3)
  const myOffersPreview = (allMyOffers ?? []).filter((o) => o.status !== 'completed' && o.status !== 'cancelled').slice(0, 3)
  const myProposalsPreview = (allMyProposals ?? []).slice(0, 3)

  let myProposalsRequestById = new Map<string, { item_description: string; status: TravelRequestStatus }>()
  const previewRequestIds = Array.from(new Set(myProposalsPreview.map((p) => p.request_id)))
  if (previewRequestIds.length > 0) {
    const { data: previewRequests } = await supabase
      .from('travel_requests')
      .select('id, item_description, status')
      .in('id', previewRequestIds)
    myProposalsRequestById = new Map((previewRequests ?? []).map((r) => [r.id, r]))
  }

  let receivedProposalsCount = 0
  if (myRequestIds.length > 0) {
    const { count } = await supabase
      .from('travel_proposals')
      .select('id', { count: 'exact', head: true })
      .in('request_id', myRequestIds)
    receivedProposalsCount = count ?? 0
  }

  // Un seul compteur combiné (envoyées + reçues) — cf. plan validé, distinct
  // des 2 compteurs séparés déjà affichés sur /jibli. La section "Mes
  // propositions" plus bas ne montre que les ENVOYÉES (MyProposalsPreview,
  // réutilisé tel quel) — les reçues n'ont pas de section dédiée ici,
  // seulement les 3 sections listées dans le plan validé (demandes/
  // articles/propositions), symétrique aux 3 compteurs de l'en-tête.
  const proposalsCount = sentProposalsCount + receivedProposalsCount

  // "Activité en direct" — product_offers/travel_requests 'open' sont déjà
  // publiquement lisibles par RLS (using(true) / status='open'), pas besoin
  // d'un accès élevé. Agrégation par pays faite en JS (cf. lib/countryGeo.ts).
  const [{ data: openOffersOrigins }, { data: openRequestsOrigins }] = await Promise.all([
    supabase.from('product_offers').select('origin_country').eq('status', 'open'),
    supabase.from('travel_requests').select('origin_country').eq('status', 'open'),
  ])
  const articlesFlow = aggregateByCountry((openOffersOrigins ?? []).map((o) => o.origin_country))
  const demandesFlow = aggregateByCountry((openRequestsOrigins ?? []).map((r) => r.origin_country))

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Heading level="h1">
        Bonjour {firstName(profile?.full_name ?? null) || 'toi'} 👋
      </Heading>
      <p className="mt-1 text-sm text-slate-500">Ton activité Jibli en un coup d&apos;œil.</p>

      {flouciBanner && (
        <div className={`mt-4 rounded-lg border p-3 text-sm ${flouciBanner.tone}`}>{flouciBanner.text}</div>
      )}

      <div className="mt-6">
        <IdentityBanner status={identityStatus} rejectionReason={identityRejectionReason} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard icon={ClipboardList} value={requestsCount} label="Mes demandes" />
        <StatCard icon={Tag} value={offersCount} label="Mes articles" />
        <StatCard icon={ArrowLeftRight} value={proposalsCount} label="Propositions" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/jibli/nouvelle-demande">
          <Button size="sm">
            <PlusCircle className="h-4 w-4" aria-hidden />
            Publier une demande
          </Button>
        </Link>
        <Link href="/jibli/offres/nouveau">
          <Button size="sm">
            <PlusCircle className="h-4 w-4" aria-hidden />
            Publier un article
          </Button>
        </Link>
        <Link href="/jibli/mes-demandes">
          <Button variant="secondary" size="sm">
            Mes demandes
          </Button>
        </Link>
        <Link href="/jibli/mes-offres">
          <Button variant="secondary" size="sm">
            Mes missions/offres
          </Button>
        </Link>
      </div>

      <CountryFlowSection articles={articlesFlow} demandes={demandesFlow} />

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MyRequestsPreview requests={myRequestsPreview} totalCount={requestsCount} />
        <MyOffersPreview offers={myOffersPreview} totalCount={offersCount} />
        <MyProposalsPreview proposals={myProposalsPreview} requestById={myProposalsRequestById} totalCount={sentProposalsCount} />
      </div>

      <RecentActivity notifications={recentNotifications} />

      {/* Portefeuille — chantier séparation Parrainage/Portefeuille :
          déménagé depuis /parrainage (qui redevient une page simple, sans
          onglets). Position basse volontaire : gestion de compte, pas de
          l'aperçu d'activité comme le reste de cette page — même contenu,
          mêmes composants (WalletDepositForm/WalletWithdrawalForm) que
          l'ancien onglet Portefeuille, juste reconnectés aux données de
          cette page (profile/bankInfo/deposits/withdrawals ci-dessus). */}
      <div className="mt-8 space-y-4">
        <Heading level="h2">Portefeuille</Heading>

        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Solde disponible</p>
            <p><Price amount={profile?.wallet_balance ?? 0} size="lg" /></p>
          </div>
          <p className="max-w-[55%] text-right text-xs text-slate-400">Crédité par parrainage ou par dépôt.</p>
        </Card>

        <Card>
          <Heading level="h3" className="mb-2">Déposer</Heading>
          <WalletDepositForm bankInfo={bankInfo ?? null} />
        </Card>

        {deposits && deposits.length > 0 && (
          <Card>
            <Heading level="h3" className="mb-2">Historique des dépôts</Heading>
            <ul className="divide-y divide-slate-100">
              {deposits.map((deposit) => (
                <li key={deposit.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p><Price amount={deposit.amount} size="sm" /></p>
                    <p className="text-xs text-slate-400">{new Date(deposit.created_at).toLocaleString('fr-TN')}</p>
                  </div>
                  <WalletDepositStatusBadge status={deposit.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <Heading level="h3" className="mb-2">Retirer</Heading>
          <WalletWithdrawalForm balance={profile?.wallet_balance ?? 0} />
        </Card>

        {withdrawals && withdrawals.length > 0 && (
          <Card>
            <Heading level="h3" className="mb-2">Historique des retraits</Heading>
            <ul className="divide-y divide-slate-100">
              {withdrawals.map((withdrawal) => (
                <li key={withdrawal.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p><Price amount={withdrawal.amount} size="sm" /></p>
                    <p className="text-xs text-slate-400">{new Date(withdrawal.requested_at).toLocaleString('fr-TN')}</p>
                  </div>
                  <WithdrawalStatusBadge status={withdrawal.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </main>
  )
}
