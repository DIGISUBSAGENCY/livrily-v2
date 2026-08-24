import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sparkles, Plane, Tag, Luggage } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BoostPayment } from '@/components/travel/BoostPayment'
import { BoostBadge, isBoosted } from '@/components/travel/BoostBadge'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import type { BankTransferInfo, BoostPricingTier, Trip, ProductOffer, TravelRequest } from '@/types/database'

export const metadata: Metadata = pageMetadata({
  title: 'Mes boosts',
  description: 'Mets en avant tes trips, offres et demandes publiés sur Livrily.',
  noIndex: true,
})

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib'>
type BoostTier = Pick<BoostPricingTier, 'duration_days' | 'price_tnd'>

function statusLine(boostedUntil: string | null): string {
  return isBoosted(boostedUntil)
    ? `Boosté jusqu'au ${new Date(boostedUntil as string).toLocaleDateString('fr-TN')}`
    : 'Non boosté'
}

// Point d'entrée EN PLUS du CTA déjà présent sur chaque fiche détail (pas
// un remplacement) — liste en un seul endroit tout ce que le voyageur/
// client connecté peut booster : trips/product_offers/travel_requests
// 'open' uniquement (un item matched n'est plus listé nulle part dans les
// pages publiques, cf. schema.sql — booster n'y aurait aucun effet
// visible). Réutilise BoostPayment.tsx tel quel pour chaque item, pas de
// logique dupliquée — cf. plan validé.
export default async function MesBoostsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/profil/mes-boosts')

  const [
    { data: trips },
    { data: offers },
    { data: requests },
    { data: activeBankInfo },
    { data: pricing },
  ] = await Promise.all([
    supabase.from('trips').select('*').eq('voyageur_id', user.id).eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('product_offers').select('*').eq('voyageur_id', user.id).eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('travel_requests').select('*').eq('client_id', user.id).eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('bank_transfer_info').select('bank_name, account_holder, rib').eq('is_active', true).limit(1).maybeSingle(),
    // platform_settings/boost_pricing_tiers sont admin-only en RLS — cf.
    // trips/[id]/page.tsx. Un seul appel partagé par tous les items
    // ci-dessous, pas un par carte.
    supabase.rpc('get_boost_pricing_tiers'),
  ])

  const bankInfo: PlatformPaymentInfo | null = activeBankInfo
  const tiers: BoostTier[] = pricing ?? []

  const tripList = (trips ?? []) as Trip[]
  const offerList = (offers ?? []) as ProductOffer[]
  const requestList = (requests ?? []) as TravelRequest[]
  const isEmpty = tripList.length === 0 && offerList.length === 0 && requestList.length === 0

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/profil/parametres" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Paramètres
      </Link>

      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Sparkles className="h-6 w-6 text-brand-600" aria-hidden />
        Mes boosts
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Mets en avant tes trips, offres et demandes ouverts — ils apparaissent en priorité dans les listings.
      </p>

      {isEmpty && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Sparkles className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Tu n&apos;as encore rien à booster.</p>
          <p className="mt-1 text-sm">
            <Link href="/jibli/trips/nouveau" className="font-medium text-brand-600 hover:underline">
              Publier un trip
            </Link>
            {', '}
            <Link href="/jibli/offres/nouveau" className="font-medium text-brand-600 hover:underline">
              une offre
            </Link>
            {' ou '}
            <Link href="/jibli/nouvelle-demande" className="font-medium text-brand-600 hover:underline">
              une demande
            </Link>
            .
          </p>
        </div>
      )}

      {tripList.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Plane className="h-4 w-4" aria-hidden /> Trips
          </h2>
          <div className="mt-2 space-y-3">
            {tripList.map((trip) => (
              <Card key={trip.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/jibli/trips/${trip.id}`}
                      className="truncate font-medium text-slate-900 hover:text-brand-700"
                    >
                      {trip.origin_country} → {trip.destination_city}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">{statusLine(trip.boosted_until)}</p>
                  </div>
                  {isBoosted(trip.boosted_until) && <BoostBadge />}
                </div>
                <div className="mt-3">
                  <BoostPayment
                    itemType="trip"
                    itemId={trip.id}
                    bankInfo={bankInfo}
                    tiers={tiers}
                    currentBoostedUntil={isBoosted(trip.boosted_until) ? trip.boosted_until : null}
                    redirectTo="/profil/mes-boosts"
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {offerList.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Tag className="h-4 w-4" aria-hidden /> Offres
          </h2>
          <div className="mt-2 space-y-3">
            {offerList.map((offer) => (
              <Card key={offer.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/jibli/offres/${offer.id}`}
                      className="truncate font-medium text-slate-900 hover:text-brand-700"
                    >
                      {offer.item_description}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">{statusLine(offer.boosted_until)}</p>
                  </div>
                  {isBoosted(offer.boosted_until) && <BoostBadge />}
                </div>
                <div className="mt-3">
                  <BoostPayment
                    itemType="offer"
                    itemId={offer.id}
                    bankInfo={bankInfo}
                    tiers={tiers}
                    currentBoostedUntil={isBoosted(offer.boosted_until) ? offer.boosted_until : null}
                    redirectTo="/profil/mes-boosts"
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {requestList.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Luggage className="h-4 w-4" aria-hidden /> Demandes
          </h2>
          <div className="mt-2 space-y-3">
            {requestList.map((request) => (
              <Card key={request.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/jibli/${request.id}`}
                      className="truncate font-medium text-slate-900 hover:text-brand-700"
                    >
                      {request.item_description}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">{statusLine(request.boosted_until)}</p>
                  </div>
                  {isBoosted(request.boosted_until) && <BoostBadge />}
                </div>
                <div className="mt-3">
                  <BoostPayment
                    itemType="request"
                    itemId={request.id}
                    bankInfo={bankInfo}
                    tiers={tiers}
                    currentBoostedUntil={isBoosted(request.boosted_until) ? request.boosted_until : null}
                    redirectTo="/profil/mes-boosts"
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
