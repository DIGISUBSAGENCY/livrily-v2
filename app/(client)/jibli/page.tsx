import type { Metadata } from 'next'
import Link from 'next/link'
import { Plane, Package, ClipboardList, Inbox, Luggage } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RequestCard } from '@/components/travel/RequestCard'
import { RequestFilters, type RequestSort } from '@/components/travel/RequestFilters'
import { DashboardStatCard } from '@/components/travel/DashboardStatCard'
import { MyRequestsPreview } from '@/components/travel/MyRequestsPreview'
import { MyProposalsPreview } from '@/components/travel/MyProposalsPreview'
import { ReceivedProposalsPreview } from '@/components/travel/ReceivedProposalsPreview'
import { Button } from '@/components/ui/Button'
import { IdentityBanner } from '@/components/account/IdentityBanner'
import { OnboardingTour } from '@/components/onboarding/OnboardingTour'
import { getIdentityStatus } from '@/lib/identity'
import { getPublicProfileSummaries } from '@/lib/profiles'
import { pageMetadata } from '@/lib/seo'
import type { TravelRequest, TravelProposal, TravelRequestStatus } from '@/types/database'

export const metadata: Metadata = pageMetadata({
  title: 'Jibli chay men l’a5er — Crowd-shipping',
  description:
    "Demande à un voyageur de te ramener un objet de l'étranger, ou rentabilise ton prochain voyage en le ramenant toi-même. Paiement sécurisé, en séquestre jusqu'à réception.",
})

// Seuil du chip "Bon prix" — faute de volume réel pour calibrer un seuil
// dynamique, constante documentée simple (même approche que
// SUGGESTED_FEE_RATE dans lib/travel/estimateGain.ts), à ajuster une fois
// qu'on a des données de distribution des budgets.
const GOOD_PRICE_THRESHOLD_TND = 100
// Fenêtre du chip "Départ bientôt" : demandes dont la date limite tombe
// dans les 14 prochains jours.
const SOON_WINDOW_DAYS = 14

interface JibliPageProps {
  searchParams: Promise<{
    origin?: string
    destination?: string
    soon?: string
    good_price?: string
    budget_min?: string
    budget_max?: string
    needed_before?: string
    sort?: string
  }>
}

export default async function JibliHomePage({ searchParams }: JibliPageProps) {
  const {
    origin,
    destination,
    soon,
    good_price: goodPrice,
    budget_min: budgetMin,
    budget_max: budgetMax,
    needed_before: neededBefore,
    sort: sortParam,
  } = await searchParams
  const sort: RequestSort = sortParam === 'price_desc' || sortParam === 'deadline_asc' ? sortParam : 'recent'
  const supabase = await createClient()

  let query = supabase.from('travel_requests').select('*').eq('status', 'open')

  if (origin) query = query.ilike('origin_country', `%${origin}%`)
  if (destination) query = query.ilike('destination_city', `%${destination}%`)
  if (soon === '1') {
    const soonThreshold = new Date(Date.now() + SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    query = query.not('needed_by', 'is', null).lte('needed_by', soonThreshold)
  }
  if (goodPrice === '1') query = query.gte('budget_max', GOOD_PRICE_THRESHOLD_TND)
  if (budgetMin) query = query.gte('budget_max', Number(budgetMin))
  if (budgetMax) query = query.lte('budget_max', Number(budgetMax))
  if (neededBefore) query = query.not('needed_by', 'is', null).lte('needed_by', neededBefore)

  if (sort === 'price_desc') query = query.order('budget_max', { ascending: false })
  else if (sort === 'deadline_asc') query = query.order('needed_by', { ascending: true, nullsFirst: false })
  else query = query.order('created_at', { ascending: false })

  const { data: requests, error } = await query

  // Un seul appel batché pour toute la grille marketplace
  // (get_public_profile_summaries), pas un par carte — cf. lib/profiles.ts.
  // Propriétaire = le CLIENT ici (contrairement à Trips/Offres où c'est le
  // voyageur). Distinct de receivedVoyageurNames plus bas (déjà couvert
  // par profiles_select_travel_counterparties, contreparties déjà en
  // relation — pas besoin de la nouvelle RPC là où l'accès direct marche
  // déjà).
  const requestOwners = await getPublicProfileSummaries(supabase, (requests ?? []).map((r) => r.client_id))

  const hasActiveFilters = Boolean(
    origin || destination || soon === '1' || goodPrice === '1' || budgetMin || budgetMax || neededBefore
  )

  // Pays d'origine des demandes ouvertes, pour les chips de route rapides
  // (RequestFilters) — requête séparée, non filtrée par les filtres
  // courants, pour que la liste de chips reste stable pendant qu'on filtre.
  const { data: openRequestsOrigins } = await supabase.from('travel_requests').select('origin_country').eq('status', 'open')
  const availableCountries = Array.from(new Set((openRequestsOrigins ?? []).map((r) => r.origin_country))).sort()

  // Propositions du voyageur courant sur les demandes affichées, pour
  // remplacer l'estimation par le gain réel sur sa propre carte (cf. RLS :
  // il ne peut de toute façon pas voir celles des autres voyageurs).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let ownProposalsByRequest = new Map<string, { item_price: number; delivery_fee: number }>()
  if (user && requests && requests.length > 0) {
    const { data: ownProposals } = await supabase
      .from('travel_proposals')
      .select('request_id, item_price, delivery_fee')
      .eq('voyageur_id', user.id)
      .in('request_id', requests.map((r) => r.id))

    ownProposalsByRequest = new Map(
      (ownProposals ?? []).map((p) => [p.request_id, { item_price: p.item_price, delivery_fee: p.delivery_fee }])
    )
  }

  // Bloc dashboard (bandeau KYC, stats, aperçus) : uniquement pour un
  // compte client connecté — enrichit /jibli sans toucher au reste de la
  // page (marketplace publique ci-dessous, inchangée pour tout le monde,
  // y compris les visiteurs non connectés).
  let role: string | null = null
  let showOnboarding = false
  let identityStatus: Awaited<ReturnType<typeof getIdentityStatus>> = 'unverified'
  let identityRejectionReason: string | null = null
  let myRequests: TravelRequest[] = []
  let myRequestsTotal = 0
  let proposalsReceivedCount = 0
  let myProposals: TravelProposal[] = []
  let myProposalsTotal = 0
  let myProposalsRequestById = new Map<string, { item_description: string; status: TravelRequestStatus }>()
  let receivedProposals: TravelProposal[] = []
  let receivedVoyageurNames = new Map<string, string>()
  let receivedRequestItemById = new Map<string, string>()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, onboarding_seen_at')
      .eq('id', user.id)
      .single()
    role = profile?.role ?? null

    if (role === 'client') {
      showOnboarding = !profile?.onboarding_seen_at

      const [{ data: verification }, { data: allMyRequests }, { data: allMyProposals }] = await Promise.all([
        supabase.from('identity_verifications').select('status, rejection_reason').eq('profile_id', user.id).maybeSingle(),
        supabase.from('travel_requests').select('*').eq('client_id', user.id).order('created_at', { ascending: false }),
        supabase.from('travel_proposals').select('*').eq('voyageur_id', user.id).order('created_at', { ascending: false }),
      ])

      identityStatus = verification?.status ?? 'unverified'
      identityRejectionReason = verification?.rejection_reason ?? null

      myRequestsTotal = allMyRequests?.length ?? 0
      myRequests = (allMyRequests ?? []).filter((r) => r.status !== 'completed' && r.status !== 'cancelled').slice(0, 3)

      myProposalsTotal = allMyProposals?.length ?? 0
      myProposals = (allMyProposals ?? []).slice(0, 3)

      const myRequestIds = (allMyRequests ?? []).map((r) => r.id)
      if (myRequestIds.length > 0) {
        const { data: allReceivedProposals, count } = await supabase
          .from('travel_proposals')
          .select('*', { count: 'exact' })
          .in('request_id', myRequestIds)
          .order('created_at', { ascending: false })
        proposalsReceivedCount = count ?? 0
        receivedProposals = (allReceivedProposals ?? []).slice(0, 3)

        receivedRequestItemById = new Map(
          (allMyRequests ?? []).map((r) => [r.id, r.item_description])
        )

        const voyageurIds = Array.from(new Set(receivedProposals.map((p) => p.voyageur_id)))
        if (voyageurIds.length > 0) {
          const { data: voyageurProfiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', voyageurIds)
          receivedVoyageurNames = new Map((voyageurProfiles ?? []).map((p) => [p.id, p.full_name ?? 'Voyageur']))
        }
      }

      const previewRequestIds = Array.from(new Set(myProposals.map((p) => p.request_id)))
      if (previewRequestIds.length > 0) {
        const { data: previewRequests } = await supabase
          .from('travel_requests')
          .select('id, item_description, status')
          .in('id', previewRequestIds)
        myProposalsRequestById = new Map((previewRequests ?? []).map((r) => [r.id, r]))
      }
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {role === 'client' && <OnboardingTour shouldShow={showOnboarding} />}

      {role === 'client' && (
        <div className="mb-8 space-y-6">
          <IdentityBanner status={identityStatus} rejectionReason={identityRejectionReason} />

          <div className="grid gap-4 sm:grid-cols-3">
            <DashboardStatCard icon={ClipboardList} value={myRequestsTotal} label="Mes demandes" />
            <DashboardStatCard icon={Inbox} value={proposalsReceivedCount} label="Propositions reçues" />
            <DashboardStatCard icon={Luggage} value={myProposalsTotal} label="Mes propositions envoyées" />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <MyRequestsPreview requests={myRequests} totalCount={myRequestsTotal} />
            <ReceivedProposalsPreview
              proposals={receivedProposals}
              voyageurNames={receivedVoyageurNames}
              requestItemById={receivedRequestItemById}
              totalCount={proposalsReceivedCount}
              hasAnyRequest={myRequestsTotal > 0}
            />
            <MyProposalsPreview proposals={myProposals} requestById={myProposalsRequestById} totalCount={myProposalsTotal} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Plane className="h-6 w-6 text-brand-600" aria-hidden />
            Jibli chay men l&apos;a5er
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Demande à un voyageur de te ramener un objet de l&apos;étranger.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jibli/mes-demandes">
            <Button variant="secondary" size="sm">
              Mes demandes
            </Button>
          </Link>
          <Link href="/jibli/mes-propositions">
            <Button variant="secondary" size="sm">
              Mes propositions
            </Button>
          </Link>
          <Link href="/jibli/mes-gains">
            <Button variant="secondary" size="sm">
              Mes gains
            </Button>
          </Link>
          <Link href="/jibli/trips">
            <Button variant="secondary" size="sm">
              Trips
            </Button>
          </Link>
          <Link href="/jibli/nouvelle-demande">
            <Button size="sm">Publier une demande</Button>
          </Link>
        </div>
      </div>

      <div id="demandes-ouvertes" className="mt-6 scroll-mt-20">
        <RequestFilters
          defaultOrigin={origin ?? ''}
          defaultDestination={destination ?? ''}
          defaultSoon={soon === '1'}
          defaultGoodPrice={goodPrice === '1'}
          defaultBudgetMin={budgetMin ?? ''}
          defaultBudgetMax={budgetMax ?? ''}
          defaultNeededBefore={neededBefore ?? ''}
          defaultSort={sort}
          availableCountries={availableCountries}
        />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les demandes.</p>}

      {!error && requests && (
        <p className="mt-6 text-sm text-slate-500">
          {requests.length} demande{requests.length !== 1 ? 's' : ''} trouvée{requests.length !== 1 ? 's' : ''}
        </p>
      )}

      {!error && requests && requests.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center text-slate-500">
          <Package className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          {hasActiveFilters ? (
            <>
              <p>Aucune demande ne correspond à ces filtres.</p>
              <Link href="/jibli" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
                Réinitialiser les filtres
              </Link>
            </>
          ) : (
            <p>Aucune demande ouverte pour l&apos;instant.</p>
          )}
        </div>
      )}

      {!error && requests && requests.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              ownProposal={ownProposalsByRequest.get(request.id) ?? null}
              ownerName={requestOwners.get(request.client_id)?.fullName ?? null}
              ownerAvatarUrl={requestOwners.get(request.client_id)?.avatarUrl ?? null}
            />
          ))}
        </div>
      )}
    </main>
  )
}
