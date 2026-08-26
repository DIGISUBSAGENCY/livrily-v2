import Link from 'next/link'
import { Plane, Tag, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TripStatusBadge } from '@/components/travel/TripStatusBadge'
import { ProductOfferStatusBadge } from '@/components/travel/ProductOfferStatusBadge'
import { MarketplaceTypeTabs, type MarketplaceType } from '@/components/admin/MarketplaceTypeTabs'
import { MarketplaceSearchFilters } from '@/components/admin/MarketplaceSearchFilters'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import type { TripStatus, ProductOfferStatus } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { Heading } from '@/components/ui/Typography'

const STATUSES: (TripStatus | ProductOfferStatus)[] = ['open', 'matched', 'completed', 'cancelled']

function isValidStatus(value: string): value is TripStatus | ProductOfferStatus {
  return (STATUSES as string[]).includes(value)
}

interface AdminMarketplacePageProps {
  searchParams: Promise<{ type?: string; q?: string; status?: string }>
}

const PAGE_LIMIT = 100

// Vue d'ensemble en lecture seule des 2 parcours voyageur ajoutés en Phase
// 3 (Trips, Offres) — jusqu'ici seulement consultables en admin en
// naviguant comme un utilisateur normal, aucune vue dédiée. Symétrique à
// /admin/demandes : mêmes conventions (recherche + statut en searchParams,
// filtrage côté serveur après coup plutôt qu'en base — volume actuel
// faible), lecture seule (chaque ligne renvoie vers la fiche publique,
// aucune action dupliquée ici).
//
// Page unique avec onglets (?type=trips|offres) plutôt que deux pages
// séparées : Trips et Offres partagent la quasi-totalité de leur forme
// (voyageur, route, date, statut — seul le prix diffère, propre aux
// Offres), et trips_select_open_or_involved/product_offers_select_open_or_involved
// sont déjà using(true) — aucune policy RLS à ajouter, un admin lit
// exactement comme n'importe quel visiteur.
export default async function AdminMarketplacePage({ searchParams }: AdminMarketplacePageProps) {
  const { type: typeParam, q = '', status = 'all' } = await searchParams
  const type: MarketplaceType = typeParam === 'offres' ? 'offres' : typeParam === 'boosts' ? 'boosts' : 'trips'
  const supabase = await createClient()

  const preservedParams = new URLSearchParams()
  if (q) preservedParams.set('q', q)
  if (status !== 'all') preservedParams.set('status', status)

  type Row = {
    id: string
    voyageurId: string
    originCountry: string
    destinationCity: string
    travelDate: string | null
    status: TripStatus | ProductOfferStatus
    createdAt: string
    itemDescription: string | null
    price: number | null
    publicHref: string
    // Onglet Boosts actifs uniquement : type d'item (le mélange des 3
    // tables rend le badge de statut par type peu lisible — remplacé par
    // un libellé de type + la date d'expiration).
    boostKind: 'Trip' | 'Offre' | 'Demande' | null
    boostedUntil: string | null
  }

  let rows: Row[] = []
  let error: string | null = null

  if (type === 'trips') {
    let query = supabase
      .from('trips')
      .select('id, voyageur_id, origin_country, destination_city, travel_date, indicative_price, status, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
    if (isValidStatus(status)) query = query.eq('status', status)
    const { data, error: queryError } = await query
    if (queryError) error = queryError.message
    rows = (data ?? []).map((t) => ({
      id: t.id,
      voyageurId: t.voyageur_id,
      originCountry: t.origin_country,
      destinationCity: t.destination_city,
      travelDate: t.travel_date,
      status: t.status,
      createdAt: t.created_at,
      itemDescription: null,
      price: t.indicative_price,
      publicHref: `/jibli/trips/${t.id}`,
      boostKind: null,
      boostedUntil: null,
    }))
  } else if (type === 'boosts') {
    // Boosts actifs — les 3 tables boostables (le boost couvre aussi les
    // demandes, pas seulement Trips/Offres : les omettre recréerait un
    // angle mort dans la seule vue boost). boosted_until > now() côté
    // requête ; tri par expiration croissante (le plus proche de la fin en
    // premier — l'info la plus actionnable). Le filtre statut de la barre
    // de recherche s'applique tel quel (les 3 types partagent les mêmes
    // valeurs de statut).
    const nowIso = new Date().toISOString()
    const [tripsRes, offersRes, requestsRes] = await Promise.all([
      supabase.from('trips').select('id, voyageur_id, origin_country, destination_city, status, created_at, boosted_until').gt('boosted_until', nowIso).limit(PAGE_LIMIT),
      supabase.from('product_offers').select('id, voyageur_id, item_description, origin_country, destination_city, status, created_at, boosted_until').gt('boosted_until', nowIso).limit(PAGE_LIMIT),
      supabase.from('travel_requests').select('id, client_id, item_description, origin_country, destination_city, status, created_at, boosted_until').gt('boosted_until', nowIso).limit(PAGE_LIMIT),
    ])
    error = tripsRes.error?.message ?? offersRes.error?.message ?? requestsRes.error?.message ?? null
    rows = [
      ...(tripsRes.data ?? []).map((t): Row => ({
        id: t.id, voyageurId: t.voyageur_id, originCountry: t.origin_country, destinationCity: t.destination_city,
        travelDate: null, status: t.status, createdAt: t.created_at, itemDescription: null, price: null,
        publicHref: `/jibli/trips/${t.id}`, boostKind: 'Trip', boostedUntil: t.boosted_until,
      })),
      ...(offersRes.data ?? []).map((o): Row => ({
        id: o.id, voyageurId: o.voyageur_id, originCountry: o.origin_country, destinationCity: o.destination_city,
        travelDate: null, status: o.status, createdAt: o.created_at, itemDescription: o.item_description, price: null,
        publicHref: `/jibli/offres/${o.id}`, boostKind: 'Offre', boostedUntil: o.boosted_until,
      })),
      ...(requestsRes.data ?? []).map((r): Row => ({
        id: r.id, voyageurId: r.client_id, originCountry: r.origin_country, destinationCity: r.destination_city,
        travelDate: null, status: r.status as TripStatus | ProductOfferStatus, createdAt: r.created_at, itemDescription: r.item_description, price: null,
        publicHref: `/jibli/${r.id}`, boostKind: 'Demande', boostedUntil: r.boosted_until,
      })),
    ].sort((a, b) => (a.boostedUntil ?? '').localeCompare(b.boostedUntil ?? ''))
    if (isValidStatus(status)) rows = rows.filter((r) => r.status === status)
  } else {
    let query = supabase
      .from('product_offers')
      .select('id, voyageur_id, item_description, origin_country, destination_city, travel_date, item_price, delivery_fee, status, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_LIMIT)
    if (isValidStatus(status)) query = query.eq('status', status)
    const { data, error: queryError } = await query
    if (queryError) error = queryError.message
    rows = (data ?? []).map((o) => ({
      id: o.id,
      voyageurId: o.voyageur_id,
      originCountry: o.origin_country,
      destinationCity: o.destination_city,
      travelDate: o.travel_date,
      status: o.status,
      createdAt: o.created_at,
      itemDescription: o.item_description,
      price: o.item_price + o.delivery_fee,
      publicHref: `/jibli/offres/${o.id}`,
      boostKind: null,
      boostedUntil: null,
    }))
  }

  // Accès direct à profiles (pas get_public_profile_summaries, réservée
  // aux visiteurs non-admin) : is_admin() donne déjà un accès complet via
  // profiles_select_own_or_admin, même pattern que clientNameById/
  // voyageurNameById sur AdminDemandesPage.
  const voyageurIds = Array.from(new Set(rows.map((r) => r.voyageurId)))
  const { data: voyageurs } = voyageurIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', voyageurIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const voyageurNameById = new Map((voyageurs ?? []).map((v) => [v.id, v.full_name ?? 'Voyageur']))

  const needle = q.trim().toLowerCase()
  const filtered = rows.filter((r) => {
    if (!needle) return true
    const voyageurName = voyageurNameById.get(r.voyageurId) ?? ''
    return (
      voyageurName.toLowerCase().includes(needle) ||
      r.originCountry.toLowerCase().includes(needle) ||
      r.destinationCity.toLowerCase().includes(needle) ||
      (r.itemDescription ?? '').toLowerCase().includes(needle)
    )
  })

  const Icon = type === 'trips' ? Plane : type === 'boosts' ? Sparkles : Tag

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Heading level="h1" className="flex items-center gap-2">
        <Icon className="h-6 w-6 text-brand-600" aria-hidden />
        Marketplace
      </Heading>
      <p className="mt-1 text-sm text-slate-500">
        Vue d&apos;ensemble des Trips, Offres et mises en avant actives — lecture seule.
      </p>

      <div className="mt-6">
        <MarketplaceTypeTabs type={type} preservedQuery={preservedParams.toString()} />
      </div>

      <div className="mt-4">
        <MarketplaceSearchFilters defaultQuery={q} defaultStatus={status} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les données.</p>}

      {!error && filtered.length === 0 && (
        <EmptyState icon={Icon}>
          <p>
            {type === 'boosts'
              ? 'Aucune mise en avant active ne correspond à ces critères.'
              : `Aucun${type === 'trips' ? ' trip' : 'e offre'} ne correspond à ces critères.`}
          </p>
        </EmptyState>
      )}

      {!error && filtered.length > 0 && (
        <div className="mt-6 space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={r.publicHref} className="truncate font-medium text-slate-900 hover:underline">
                    {r.itemDescription ?? `${r.originCountry} → ${r.destinationCity}`}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {voyageurNameById.get(r.voyageurId) ?? 'Voyageur'}
                    {r.itemDescription && ` · ${r.originCountry} → ${r.destinationCity}`}
                    {r.travelDate && ` · ${new Date(r.travelDate).toLocaleDateString('fr-TN')}`}
                  </p>
                </div>
                {type === 'boosts' ? (
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">{r.boostKind}</p>
                    {r.boostedUntil && (
                      <p className="text-xs text-slate-500">
                        En avant jusqu&apos;au {new Date(r.boostedUntil).toLocaleString('fr-TN')}
                      </p>
                    )}
                  </div>
                ) : type === 'trips' ? (
                  <TripStatusBadge status={r.status as TripStatus} />
                ) : (
                  <ProductOfferStatusBadge status={r.status as ProductOfferStatus} />
                )}
              </div>

              {r.price !== null && (
                <p className="mt-2 text-sm font-medium text-slate-700">
                  {formatTND(r.price)}
                  {type === 'trips' && <span className="ml-1 text-xs font-normal text-slate-400">(indicatif)</span>}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
