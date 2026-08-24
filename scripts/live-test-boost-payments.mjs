// Tests en direct de purchase_boost_virement() — achat, cumul sur boost
// déjà actif, rejets (item non-open, non-propriétaire), grants
// anon/authenticated. Mêmes conventions que les scripts précédents.
//
// Usage : node scripts/live-test-boost-payments.mjs
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
  return { supabase }
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], offers: [] }

async function run() {
  const voyageurId = await makeUser(`boost-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const { supabase: voyageur } = await signInSession(`boost-voyageur-${ts}@example.com`, password)

  const otherId = await makeUser(`boost-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const { supabase: other } = await signInSession(`boost-other-${ts}@example.com`, password)

  const { data: settings } = await service.from('platform_settings').select('boost_price_tnd, boost_duration_days').eq('id', true).single()
  console.log('Config actuelle:', settings)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // ==========================================================================
  // Scénario 1 : achat sur un trip 'open' — boosted_until posé, paiement tracé
  // ==========================================================================
  console.log('\n=== Scénario 1 : achat boost sur un trip open ===')
  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostTestFR', destination_city: 'BoostTestTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(trip.id)

  const beforePurchase = new Date()
  const { data: purchase1, error: purchase1Err } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/fake-proof-1.jpg',
  })
  check('purchase_boost_virement() (trip, open) réussit', !purchase1Err, { purchase1Err })
  const row1 = purchase1?.[0]
  check('boosted_until renvoyé, dans le futur', !!row1?.new_boosted_until && new Date(row1.new_boosted_until) > beforePurchase, { row1 })

  const { data: tripAfter1 } = await service.from('trips').select('boosted_until').eq('id', trip.id).single()
  check('trips.boosted_until réellement posé en base', tripAfter1?.boosted_until === row1?.new_boosted_until, { tripAfter1, row1 })

  const { data: paymentsForTrip } = await service.from('boost_payments').select('*').eq('trip_id', trip.id)
  check('boost_payments créé (1 ligne), status=awaiting_verification, amount/duration = config', paymentsForTrip?.length === 1 &&
    paymentsForTrip[0].status === 'awaiting_verification' &&
    Number(paymentsForTrip[0].amount) === Number(settings.boost_price_tnd) &&
    paymentsForTrip[0].duration_days === settings.boost_duration_days &&
    paymentsForTrip[0].trip_id === trip.id &&
    paymentsForTrip[0].product_offer_id === null,
    { paymentsForTrip })

  // ==========================================================================
  // Scénario 2 : cumul — ré-achat pendant un boost encore actif prolonge
  // depuis la fin du boost en cours, pas depuis maintenant.
  // ==========================================================================
  console.log('\n=== Scénario 2 : cumul sur un boost déjà actif ===')
  const { data: purchase2, error: purchase2Err } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/fake-proof-2.jpg',
  })
  check('2e achat (cumul) réussit', !purchase2Err, { purchase2Err })
  const row2 = purchase2?.[0]
  const expectedCumulMin = new Date(row1.new_boosted_until)
  expectedCumulMin.setDate(expectedCumulMin.getDate() + settings.boost_duration_days - 1) // tolérance légère
  check(
    'le nouveau boosted_until prolonge depuis la FIN du précédent (pas depuis maintenant)',
    new Date(row2.new_boosted_until) >= expectedCumulMin,
    { previous: row1.new_boosted_until, new: row2.new_boosted_until, expectedCumulMin: expectedCumulMin.toISOString() }
  )

  const { data: paymentsForTripAfter2 } = await service.from('boost_payments').select('id').eq('trip_id', trip.id)
  check('2 lignes boost_payments distinctes pour ce trip (historique conservé)', paymentsForTripAfter2?.length === 2, {
    paymentsForTripAfter2,
  })

  // ==========================================================================
  // Scénario 3 : rejet sur un item non-open
  // ==========================================================================
  console.log('\n=== Scénario 3 : rejet sur un item non-open ===')
  const { data: matchedTrip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostTestFR2', destination_city: 'BoostTestTN2', travel_date: travelDate, available_weight_kg: 10, status: 'matched' })
    .select('id')
    .single()
  cleanup.trips.push(matchedTrip.id)

  const { error: matchedErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: matchedTrip.id,
    p_payment_proof_url: 'fixtures/fake-proof-3.jpg',
  })
  check('achat sur un trip status=matched rejeté', !!matchedErr, { matchedErr })
  check('message d\'erreur explicite ("open")', (matchedErr?.message ?? '').includes('open'), { matchedErr })

  // ==========================================================================
  // Scénario 4 : rejet pour un non-propriétaire
  // ==========================================================================
  console.log('\n=== Scénario 4 : rejet pour un non-propriétaire ===')
  const { error: notOwnerErr } = await other.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/fake-proof-4.jpg',
  })
  check('achat par un tiers (pas le propriétaire) rejeté', !!notOwnerErr, { notOwnerErr })
  check('message d\'erreur explicite ("propriétaire")', (notOwnerErr?.message ?? '').includes('propriétaire'), { notOwnerErr })

  // ==========================================================================
  // Scénario 5 : symétrie côté offre (product_offers)
  // ==========================================================================
  console.log('\n=== Scénario 5 : achat boost sur une offre open (symétrie) ===')
  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Boost test offer ${ts}`, origin_country: 'BoostTestFR', destination_city: 'BoostTestTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(offer.id)

  const { data: purchaseOffer, error: purchaseOfferErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'offer',
    p_item_id: offer.id,
    p_payment_proof_url: 'fixtures/fake-proof-offer.jpg',
  })
  check('purchase_boost_virement() (offer, open) réussit', !purchaseOfferErr, { purchaseOfferErr })
  const { data: offerAfter } = await service.from('product_offers').select('boosted_until').eq('id', offer.id).single()
  check('product_offers.boosted_until posé', !!offerAfter?.boosted_until && offerAfter.boosted_until === purchaseOffer?.[0]?.new_boosted_until, {
    offerAfter,
    purchaseOffer,
  })
  const { data: paymentsForOffer } = await service.from('boost_payments').select('*').eq('product_offer_id', offer.id)
  check('boost_payments lié à product_offer_id (pas trip_id)', paymentsForOffer?.length === 1 && paymentsForOffer[0].trip_id === null, {
    paymentsForOffer,
  })

  // ==========================================================================
  // Scénario 6 : grants — anon rejeté
  // ==========================================================================
  console.log('\n=== Scénario 6 : grants (anon) ===')
  const anon = createAnonClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: anonErr } = await anon.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/fake-proof-anon.jpg',
  })
  check('purchase_boost_virement() refusé pour anon (permission denied)', !!anonErr, { anonErr })

  // Cleanup
  for (const id of cleanup.trips) {
    await service.from('boost_payments').delete().eq('trip_id', id)
    await service.from('trips').delete().eq('id', id)
  }
  for (const id of cleanup.offers) {
    await service.from('boost_payments').delete().eq('product_offer_id', id)
    await service.from('product_offers').delete().eq('id', id)
  }
  for (const id of cleanup.users) await service.auth.admin.deleteUser(id)

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  // Le query builder Supabase est "thenable" (.then), pas un vrai Promise
  // (.catch n'existe pas dessus directement) — try/catch plutôt que
  // chaîné, pour un nettoyage best-effort qui ne plante jamais lui-même.
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) {
    try { await service.auth.admin.deleteUser(id) } catch {}
  }
  process.exit(1)
})
