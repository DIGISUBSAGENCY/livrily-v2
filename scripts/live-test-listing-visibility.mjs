// Tests en direct de l'élargissement de visibilité RLS sur trips/
// product_offers (using(true)) + du filtrage au niveau des pages listing
// (/jibli/trips, /jibli/offres : 'open'+'matched' visibles, 'completed'/
// 'cancelled' filtrés). Mêmes conventions que les scripts précédents.
//
// Usage :
//   node scripts/live-test-listing-visibility.mjs           (RLS + query)
//   npm run dev (autre terminal), puis relancer avec RUN_HTTP=1 pour
//   inclure aussi le rendu HTTP réel des 2 pages listing.
import { createClient as createServiceClient, createClient as createAnonClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim()
  if (!(k in process.env)) process.env[k] = v
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = 'http://localhost:3000'
const service = createServiceClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }
}

async function makeUser(email, password) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user.id
}

async function signInSession(email, password) {
  const jar = new Map()
  const supabase = createServerClient(SUPABASE_URL, ANON, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (toSet) => toSet.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  const cookie = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { supabase, cookie }
}

const ts = Date.now()
const ORIGIN = `TestVisFR${ts}`
const DEST = `TestVisTN${ts}`
const statuses = ['open', 'matched', 'completed', 'cancelled']

const cleanup = { users: [], trips: [], offers: [] }

async function run() {
  const password = 'LiveTestPass!23'
  const voyageurId = await makeUser(`vis-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const thirdPartyId = await makeUser(`vis-thirdparty-${ts}@example.com`, password)
  cleanup.users.push(thirdPartyId)
  const { supabase: thirdParty } = await signInSession(`vis-thirdparty-${ts}@example.com`, password)
  const anon = createAnonClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // --- Fixtures : 1 trip + 1 offer par statut ---
  const tripByStatus = {}
  const offerByStatus = {}
  for (const status of statuses) {
    const { data: trip } = await service
      .from('trips')
      .insert({
        voyageur_id: voyageurId,
        origin_country: ORIGIN,
        destination_city: DEST,
        travel_date: travelDate,
        available_weight_kg: 10,
        status,
      })
      .select('id')
      .single()
    cleanup.trips.push(trip.id)
    tripByStatus[status] = trip.id

    const { data: offer } = await service
      .from('product_offers')
      .insert({
        voyageur_id: voyageurId,
        item_description: `Vis test offer ${status} ${ts}`,
        origin_country: ORIGIN,
        destination_city: DEST,
        travel_date: travelDate,
        item_price: 100,
        delivery_fee: 20,
        status,
      })
      .select('id')
      .single()
    cleanup.offers.push(offer.id)
    offerByStatus[status] = offer.id
  }

  // ==========================================================================
  // Scénario 1 : RLS SELECT (using(true)) — anon ET tiers authentifié
  // voient TOUS les statuts, pas seulement 'open'.
  // ==========================================================================
  console.log("\n=== Scénario 1 : RLS SELECT — visibilité publique totale (using(true)) ===")
  for (const status of statuses) {
    const { data: anonTrip } = await anon.from('trips').select('id').eq('id', tripByStatus[status]).maybeSingle()
    check(`anon voit le trip status=${status}`, anonTrip?.id === tripByStatus[status], { anonTrip })

    const { data: thirdPartyTrip } = await thirdParty.from('trips').select('id').eq('id', tripByStatus[status]).maybeSingle()
    check(`tiers authentifié voit le trip status=${status}`, thirdPartyTrip?.id === tripByStatus[status], { thirdPartyTrip })

    const { data: anonOffer } = await anon.from('product_offers').select('id').eq('id', offerByStatus[status]).maybeSingle()
    check(`anon voit l'offre status=${status}`, anonOffer?.id === offerByStatus[status], { anonOffer })

    const { data: thirdPartyOffer } = await thirdParty.from('product_offers').select('id').eq('id', offerByStatus[status]).maybeSingle()
    check(`tiers authentifié voit l'offre status=${status}`, thirdPartyOffer?.id === offerByStatus[status], { thirdPartyOffer })
  }

  // ==========================================================================
  // Scénario 2 : query des pages listing — open+matched présents,
  // completed+cancelled absents (filtre applicatif, pas RLS).
  // ==========================================================================
  console.log("\n=== Scénario 2 : query listing (.in('status', ['open','matched'])) ===")
  {
    const { data: trips } = await anon
      .from('trips')
      .select('id, status')
      .in('status', ['open', 'matched'])
      .eq('origin_country', ORIGIN)
      .eq('destination_city', DEST)
    const tripIds = (trips ?? []).map((t) => t.id)
    check('trips: open présent', tripIds.includes(tripByStatus.open))
    check('trips: matched présent', tripIds.includes(tripByStatus.matched))
    check('trips: completed absent', !tripIds.includes(tripByStatus.completed))
    check('trips: cancelled absent', !tripIds.includes(tripByStatus.cancelled))

    const { data: offers } = await anon
      .from('product_offers')
      .select('id, status')
      .in('status', ['open', 'matched'])
      .eq('origin_country', ORIGIN)
      .eq('destination_city', DEST)
    const offerIds = (offers ?? []).map((o) => o.id)
    check('offers: open présent', offerIds.includes(offerByStatus.open))
    check('offers: matched présent', offerIds.includes(offerByStatus.matched))
    check('offers: completed absent', !offerIds.includes(offerByStatus.completed))
    check('offers: cancelled absent', !offerIds.includes(offerByStatus.cancelled))
  }

  // ==========================================================================
  // Scénario 3 (optionnel, RUN_HTTP=1) : rendu HTTP réel des 2 pages
  // listing, contenu vérifié (badges, présence/absence par statut).
  // ==========================================================================
  if (process.env.RUN_HTTP === '1') {
    console.log('\n=== Scénario 3 : rendu HTTP réel des listings (contenu) ===')
    const tripsRes = await fetch(`${BASE}/jibli/trips?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DEST)}`)
    const tripsBody = await tripsRes.text()
    check('/jibli/trips répond 200', tripsRes.status === 200, { status: tripsRes.status })
    check('/jibli/trips : pas d\'erreur RSC/runtime', !tripsBody.includes('cannot be passed directly to Client Components') && !tripsBody.includes('Application error'))
    check('/jibli/trips : badge "Mis en relation" présent (trip matched)', tripsBody.includes('Mis en relation'))
    check('/jibli/trips : "Terminé"/"Annulé" absents (completed/cancelled filtrés)', !tripsBody.includes('Terminé') && !tripsBody.includes('Annulé'))

    const offersRes = await fetch(`${BASE}/jibli/offres?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DEST)}`)
    const offersBody = await offersRes.text()
    check('/jibli/offres répond 200', offersRes.status === 200, { status: offersRes.status })
    check('/jibli/offres : pas d\'erreur RSC/runtime', !offersBody.includes('cannot be passed directly to Client Components') && !offersBody.includes('Application error'))
    check('/jibli/offres : badge "Prise" présent (offer matched)', offersBody.includes('Prise'))
    check(
      '/jibli/offres : description de l\'offre completed/cancelled absente du HTML',
      !offersBody.includes(`Vis test offer completed ${ts}`) && !offersBody.includes(`Vis test offer cancelled ${ts}`)
    )
    check(
      '/jibli/offres : description de l\'offre open/matched présente',
      offersBody.includes(`Vis test offer open ${ts}`) && offersBody.includes(`Vis test offer matched ${ts}`)
    )
  } else {
    console.log('\n(Scénario 3 sauté — relancer avec RUN_HTTP=1 et `npm run dev` actif pour inclure le rendu HTTP)')
  }

  // Cleanup
  for (const id of cleanup.trips) await service.from('trips').delete().eq('id', id)
  for (const id of cleanup.offers) await service.from('product_offers').delete().eq('id', id)
  for (const id of cleanup.users) await service.auth.admin.deleteUser(id)

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.trips) await service.from('trips').delete().eq('id', id).catch(() => {})
  for (const id of cleanup.offers) await service.from('product_offers').delete().eq('id', id).catch(() => {})
  for (const id of cleanup.users) await service.auth.admin.deleteUser(id).catch(() => {})
  process.exit(1)
})
