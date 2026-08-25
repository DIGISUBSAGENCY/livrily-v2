// Test en direct du commit 1 (notifications boost, chantier
// notifications+admin pricing) — "Confirmation de virement reçue".
// Vérifie que purchase_boost_virement() (surcharge 4-arg) insère bien une
// notification type='boost_update' pour le propriétaire de l'item, avec le
// bon related_object_type/id selon 'trip'/'offer'/'request' — pour les 3
// types d'item (trips.voyageur_id, product_offers.voyageur_id,
// travel_requests.client_id, cf. schema.sql). N'utilise pas le serveur
// Next.js (RPC direct via session, pas de fetch HTTP) — même technique que
// scripts/live-test-boost-typescript.mjs, réduite à ce seul commit.
import { readFileSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

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
const service = createServiceClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }
}

async function makeUser(email, password) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: 'Boost Notif Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
  }).eq('id', data.user.id)
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
  return supabase
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], offers: [], requests: [], payments: [] }

async function run() {
  const voyageurId = await makeUser(`boost-notif1-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const voyageur = await signInSession(`boost-notif1-${ts}@example.com`, password)

  const clientId = await makeUser(`boost-notif1-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const client = await signInSession(`boost-notif1-client-${ts}@example.com`, password)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // --- Item 1 : trip ---
  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostNotifFR', destination_city: 'BoostNotifTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id').single()
  cleanup.trips.push(trip.id)

  const { data: tripRpc, error: tripErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'trip', p_item_id: trip.id, p_payment_proof_url: 'https://example.com/proof-trip.jpg', p_duration_days: 2,
  })
  check('purchase_boost_virement (trip) réussit', !tripErr, { tripErr })
  if (tripRpc?.[0]?.payment_id) cleanup.payments.push(tripRpc[0].payment_id)

  const { data: tripNotifs } = await service
    .from('notifications')
    .select('type, title, body, related_object_type, related_object_id, user_id')
    .eq('user_id', voyageurId).eq('type', 'boost_update').order('created_at', { ascending: false }).limit(1)
  const tripNotif = tripNotifs?.[0]
  check('notification boost_update créée pour le voyageur (trip)', !!tripNotif, { tripNotif })
  check('titre = "Confirmation de virement reçue"', tripNotif?.title === 'Confirmation de virement reçue', { tripNotif })
  check('related_object_type = trip', tripNotif?.related_object_type === 'trip', { tripNotif })
  check('related_object_id = id du trip', tripNotif?.related_object_id === trip.id, { tripNotif })

  // --- Item 2 : offer ---
  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Boost notif offer ${ts}`, origin_country: 'BoostNotifFR', destination_city: 'BoostNotifTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id').single()
  cleanup.offers.push(offer.id)

  const { data: offerRpc, error: offerErr } = await voyageur.rpc('purchase_boost_virement', {
    p_item_type: 'offer', p_item_id: offer.id, p_payment_proof_url: 'https://example.com/proof-offer.jpg', p_duration_days: 3,
  })
  check('purchase_boost_virement (offer) réussit', !offerErr, { offerErr })
  if (offerRpc?.[0]?.payment_id) cleanup.payments.push(offerRpc[0].payment_id)

  const { data: offerNotifs } = await service
    .from('notifications')
    .select('type, title, related_object_type, related_object_id, user_id')
    .eq('user_id', voyageurId).eq('type', 'boost_update').order('created_at', { ascending: false }).limit(1)
  const offerNotif = offerNotifs?.[0]
  check('notification boost_update créée pour le voyageur (offer)', !!offerNotif, { offerNotif })
  check('related_object_type = product_offer', offerNotif?.related_object_type === 'product_offer', { offerNotif })
  check('related_object_id = id de l\'offre', offerNotif?.related_object_id === offer.id, { offerNotif })

  // --- Item 3 : request (owner = client_id, pas voyageur_id) ---
  const { data: request } = await service
    .from('travel_requests')
    .insert({ client_id: clientId, item_description: `Boost notif request ${ts}`, origin_country: 'BoostNotifFR', destination_city: 'BoostNotifTN', needed_by: travelDate, budget_max: 100, item_weight_kg: 1, status: 'open' })
    .select('id').single()
  cleanup.requests.push(request.id)

  const { data: requestRpc, error: requestErr } = await client.rpc('purchase_boost_virement', {
    p_item_type: 'request', p_item_id: request.id, p_payment_proof_url: 'https://example.com/proof-request.jpg', p_duration_days: 1,
  })
  check('purchase_boost_virement (request) réussit', !requestErr, { requestErr })
  if (requestRpc?.[0]?.payment_id) cleanup.payments.push(requestRpc[0].payment_id)

  const { data: requestNotifs } = await service
    .from('notifications')
    .select('type, title, related_object_type, related_object_id, user_id')
    .eq('user_id', clientId).eq('type', 'boost_update').order('created_at', { ascending: false }).limit(1)
  const requestNotif = requestNotifs?.[0]
  check('notification boost_update créée pour le client (request)', !!requestNotif, { requestNotif })
  check('related_object_type = travel_request', requestNotif?.related_object_type === 'travel_request', { requestNotif })
  check('related_object_id = id de la demande', requestNotif?.related_object_id === request.id, { requestNotif })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
    for (const id of cleanup.trips) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
      try { await service.from('trips').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.offers) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
      try { await service.from('product_offers').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.requests) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
      try { await service.from('travel_requests').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
