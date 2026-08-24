import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList, Tag, ArrowLeftRight, PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IdentityBanner } from '@/components/account/IdentityBanner'
import { DashboardStatCard } from '@/components/travel/DashboardStatCard'
import { CountryFlowSection } from '@/components/travel/CountryFlowSection'
import { Button } from '@/components/ui/Button'
import { pageMetadata } from '@/lib/seo'
import { aggregateByCountry } from '@/lib/countryGeo'

export const metadata: Metadata = pageMetadata({
  title: 'Tableau de bord',
  description: 'Ton activité Jibli en un coup d’œil.',
  noIndex: true,
})

// Extrait le prénom de full_name ("Amir Ben Salah" → "Amir") — pas de champ
// first_name/last_name séparé dans profiles (un seul champ full_name), et
// aucun helper existant pour ça ailleurs dans le projet.
function firstName(fullName: string | null): string {
  const trimmed = fullName?.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

// Nouvelle page dédiée — /jibli garde son bloc dashboard inline existant
// (IdentityBanner + DashboardStatCard + previews, réutilisés ici tels
// quels, cf. exploration) pour ne rien casser côté marketplace ; cette
// page-ci est un point d'entrée supplémentaire, plus complet (flux par
// pays, sections dédiées aux 3 types d'items, activité récente — briques
// suivantes de ce chantier).
export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/dashboard')

  // Requête directe (pas getIdentityStatus(), qui ne renvoie que le statut)
  // pour aussi récupérer rejection_reason — IdentityBanner l'affiche déjà
  // pleinement, même requête que le bloc dashboard existant sur /jibli.
  const [{ data: profile }, { data: verification }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase.from('identity_verifications').select('status, rejection_reason').eq('profile_id', user.id).maybeSingle(),
  ])
  const identityStatus = verification?.status ?? 'unverified'
  const identityRejectionReason = verification?.rejection_reason ?? null

  // allMyRequests sert à la fois de compteur ET de liste d'ids pour la
  // requête des propositions reçues juste après — même pattern que le bloc
  // dashboard existant sur /jibli (app/(client)/jibli/page.tsx), pas
  // réinventé ici.
  const [{ data: allMyRequests }, { count: offersCount }, { count: sentProposalsCount }] = await Promise.all([
    supabase.from('travel_requests').select('id').eq('client_id', user.id),
    supabase.from('product_offers').select('id', { count: 'exact', head: true }).eq('voyageur_id', user.id),
    supabase.from('travel_proposals').select('id', { count: 'exact', head: true }).eq('voyageur_id', user.id),
  ])

  const requestsCount = allMyRequests?.length ?? 0
  const myRequestIds = (allMyRequests ?? []).map((r) => r.id)

  let receivedProposalsCount = 0
  if (myRequestIds.length > 0) {
    const { count } = await supabase
      .from('travel_proposals')
      .select('id', { count: 'exact', head: true })
      .in('request_id', myRequestIds)
    receivedProposalsCount = count ?? 0
  }

  // Un seul compteur combiné (envoyées + reçues) — cf. plan validé, distinct
  // des 2 compteurs séparés déjà affichés sur /jibli.
  const proposalsCount = (sentProposalsCount ?? 0) + receivedProposalsCount

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
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Bonjour {firstName(profile?.full_name ?? null) || 'toi'} 👋
      </h1>
      <p className="mt-1 text-sm text-slate-500">Ton activité Jibli en un coup d&apos;œil.</p>

      <div className="mt-6">
        <IdentityBanner status={identityStatus} rejectionReason={identityRejectionReason} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <DashboardStatCard icon={ClipboardList} value={requestsCount} label="Mes demandes" />
        <DashboardStatCard icon={Tag} value={offersCount ?? 0} label="Mes articles" />
        <DashboardStatCard icon={ArrowLeftRight} value={proposalsCount} label="Propositions" />
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
    </main>
  )
}
