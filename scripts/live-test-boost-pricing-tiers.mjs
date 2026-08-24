// Tests en direct de la tarification par palier (Phase 3, brique 6/N) —
// boost_pricing_tiers, get_boost_pricing_tiers(), et la surcharge 4-arg de
// purchase_boost_virement() (p_duration_days, 1-7j, + support 'request').
// L'ancienne forme (3-arg, get_boost_pricing()) est retestée séparément par
// scripts/live-test-boost-payments.mjs (doit rester 15/15, additif
// uniquement) — pas dupliquée ici.
//
// Usage : node scripts/live-test-boost-pricing-tiers.mjs
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
const cleanup = { users: [], trips: [], offers: [], requests: [] }

async function run() {
  const voyageurId = await makeUser(`boost-tiers-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const { supabase: voyageur } = await signInSession(`boost-tiers-voyageur-${ts}@example.com`, password)

  const otherId = await makeUser(`boost-tiers-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const { supabase: other } = await signInSession(`boost-tiers-other-${ts}@example.com`, password)

  const { data: seededTiers } = await service.from('boost_pricing_tiers').select('*').order('duration_days')
  console.log('Grille actuelle:', seededTiers?.map((t) => `${t.duration_days}j=${t.price_tnd}`).join(', '))

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // ==========================================================================
  // 1. get_boost_pricing_tiers() — grille complète, triée, authentifié non-admin OK
  // ==========================================================================
  console.log('\n=== 1. get_boost_pricing_tiers() ===')
  const { data: tiersViaRpc, error: tiersErr } = await voyageur.rpc('get_boost_pricing_tiers')
  check('accessible à un client authentifié non-admin', !tiersErr, { tiersErr })
  check('7 paliers renvoyés (1 à 7 jours)', (tiersViaRpc ?? []).length === 7, { tiersViaRpc })
  check('triés par duration_days croissant', JSON.stringify((tiersViaRpc ?? []).map((r) => r.duration_days)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7]), {
    tiersViaRpc,
  })
  check('valeurs identiques à la table (service role)', JSON.stringify(tiersViaRpc) === JSON.stringify(seededTiers?.map((t) => ({ duration_days: t.duration_days, price_tnd: t.price_tnd }))), {
    tiersViaRpc, seededTiers,
  })

  const anon = createAnonClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: anonTiersErr } = await anon.rpc('get_boost_pricing_tiers')
  check('refusé pour anon', !!anonTiersErr, { anonTiersErr })

  // ==========================================================================
  // 2. Surcharge 4-arg — achat trip avec durée choisie, prix = grille
  // ==========================================================================
  console.log('\n=== 2. purchase_boost_virement (4-arg, trip, durée=1) ===')
  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'TiersFR', destination_city: 'TiersTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(trip.id)

  const tier1 = seededTiers.find((t) => t.duration_days === 1)
  const { data: purchase1, error: purchase1Err } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/tiers-1.jpg',
    p_duration_days: 1,
  })
  check('achat durée=1j réussit', !purchase1Err, { purchase1Err })
  const { data: paymentsAfter1 } = await service.from('boost_payments').select('amount, duration_days').eq('trip_id', trip.id)
  check('amount = prix de la grille pour 1j', Number(paymentsAfter1?.[0]?.amount) === Number(tier1.price_tnd), {
    paid: paymentsAfter1?.[0]?.amount, expected: tier1.price_tnd,
  })

  // ==========================================================================
  // 3. Cumul additif avec DURÉES VARIABLES (2j puis 5j)
  // ==========================================================================
  console.log('\n=== 3. Cumul avec durées variables ===')
  const beforeSecond = new Date(purchase1[0].new_boosted_until)
  const { data: purchase2, error: purchase2Err } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/tiers-2.jpg',
    p_duration_days: 5,
  })
  check('2e achat (5j, alors que le 1er était 1j) réussit', !purchase2Err, { purchase2Err })
  const expectedMin = new Date(beforeSecond)
  expectedMin.setDate(expectedMin.getDate() + 5 - 1) // tolérance légère
  check('prolonge depuis la FIN du 1er boost (1j), pas depuis maintenant', new Date(purchase2[0].new_boosted_until) >= expectedMin, {
    previous: beforeSecond.toISOString(), new: purchase2[0].new_boosted_until, expectedMin: expectedMin.toISOString(),
  })
  const tier5 = seededTiers.find((t) => t.duration_days === 5)
  const { data: paymentsAfter2 } = await service.from('boost_payments').select('amount, duration_days').eq('trip_id', trip.id).order('created_at')
  check('2 lignes, montants distincts correspondant à 1j puis 5j', paymentsAfter2?.length === 2 &&
    Number(paymentsAfter2[1].amount) === Number(tier5.price_tnd) && paymentsAfter2[1].duration_days === 5, {
    paymentsAfter2,
  })

  // ==========================================================================
  // 4. Durée hors grille rejetée
  // ==========================================================================
  console.log('\n=== 4. Durée invalide rejetée ===')
  const { error: badDurationErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/tiers-bad.jpg',
    p_duration_days: 8,
  })
  check('durée=8 rejetée', !!badDurationErr, { badDurationErr })
  check('message explicite ("Durée invalide")', (badDurationErr?.message ?? '').includes('Durée invalide'), { badDurationErr })

  const { error: zeroDurationErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip',
    p_item_id: trip.id,
    p_payment_proof_url: 'fixtures/tiers-zero.jpg',
    p_duration_days: 0,
  })
  check('durée=0 rejetée', !!zeroDurationErr, { zeroDurationErr })

  // ==========================================================================
  // 5. Symétrie product_offers (rapide)
  // ==========================================================================
  console.log('\n=== 5. Symétrie offer (4-arg) ===')
  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Tiers offer ${ts}`, origin_country: 'TiersFR', destination_city: 'TiersTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(offer.id)
  const { error: offerErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'offer', p_item_id: offer.id, p_payment_proof_url: 'fixtures/tiers-offer.jpg', p_duration_days: 3,
  })
  check('achat offer (4-arg) réussit', !offerErr, { offerErr })
  const { data: offerAfter } = await service.from('product_offers').select('boosted_until').eq('id', offer.id).single()
  check('product_offers.boosted_until posé', !!offerAfter?.boosted_until, { offerAfter })

  // ==========================================================================
  // 6. Nouveauté : boost sur une demande (travel_requests) 'open'
  // ==========================================================================
  console.log('\n=== 6. Boost sur travel_requests (open) ===')
  const { data: request } = await service
    .from('travel_requests')
    .insert({ client_id: voyageurId, item_description: `Tiers request ${ts}`, origin_country: 'TiersFR', destination_city: 'TiersTN', budget_max: 100, status: 'open' })
    .select('id')
    .single()
  cleanup.requests.push(request.id)

  const { data: purchaseReq, error: purchaseReqErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'request', p_item_id: request.id, p_payment_proof_url: 'fixtures/tiers-request.jpg', p_duration_days: 4,
  })
  check('achat request (open) réussit', !purchaseReqErr, { purchaseReqErr })
  const { data: requestAfter } = await service.from('travel_requests').select('boosted_until').eq('id', request.id).single()
  check('travel_requests.boosted_until posé, correspond au retour RPC', requestAfter?.boosted_until === purchaseReq?.[0]?.new_boosted_until, {
    requestAfter, purchaseReq,
  })
  const { data: paymentsForRequest } = await service.from('boost_payments').select('*').eq('request_id', request.id)
  check('boost_payments lié à request_id (trip_id/product_offer_id null)', paymentsForRequest?.length === 1 &&
    paymentsForRequest[0].trip_id === null && paymentsForRequest[0].product_offer_id === null, {
    paymentsForRequest,
  })

  // Rejet sur une demande non-open ('matched')
  const { data: matchedRequest } = await service
    .from('travel_requests')
    .insert({ client_id: voyageurId, item_description: `Tiers request matched ${ts}`, origin_country: 'TiersFR', destination_city: 'TiersTN', budget_max: 100, status: 'matched' })
    .select('id')
    .single()
  cleanup.requests.push(matchedRequest.id)
  const { error: matchedReqErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'request', p_item_id: matchedRequest.id, p_payment_proof_url: 'fixtures/tiers-matched.jpg', p_duration_days: 2,
  })
  check('achat sur une demande status=matched rejeté', !!matchedReqErr, { matchedReqErr })
  check('message explicite ("open")', (matchedReqErr?.message ?? '').includes('open'), { matchedReqErr })

  // Rejet pour un non-propriétaire (client_id, pas voyageur_id, sur travel_requests)
  const { error: notOwnerReqErr } = await other.rpc('purchase_boost_virement', {
    p_item_type: 'request', p_item_id: request.id, p_payment_proof_url: 'fixtures/tiers-notowner.jpg', p_duration_days: 2,
  })
  check('achat par un tiers (pas le client) rejeté', !!notOwnerReqErr, { notOwnerReqErr })
  check('message explicite ("propriétaire")', (notOwnerReqErr?.message ?? '').includes('propriétaire'), { notOwnerReqErr })

  // ==========================================================================
  // 7. Grants anon — nouvelle surcharge 4-arg
  // ==========================================================================
  console.log('\n=== 7. Grants anon (4-arg) ===')
  const { error: anonPurchaseErr } = await anon.rpc('purchase_boost_virement', {
    p_item_type: 'trip', p_item_id: trip.id, p_payment_proof_url: 'fixtures/tiers-anon.jpg', p_duration_days: 1,
  })
  check('purchase_boost_virement (4-arg) refusé pour anon', !!anonPurchaseErr, { anonPurchaseErr })

  // Cleanup
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.requests) {
    try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
    try { await service.from('travel_requests').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.requests) {
    try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
    try { await service.from('travel_requests').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
