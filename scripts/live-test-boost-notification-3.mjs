// Test en direct du commit 3 (notifications boost) — "Boost terminé".
// Vérifie notify_expired_boosts() sur les 3 types d'item : détection d'un
// boosted_until expiré, notification correcte, idempotence au run suivant
// (pas de doublon), re-déclenchement après un re-boost, item non-expiré
// ignoré, et que la fonction n'est pas exécutable par un simple
// authenticated (revoke, même posture que create_notification()).
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
    full_name: 'Boost Notif3 Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const cleanup = { users: [], trips: [], offers: [], requests: [] }
const PAST = new Date(Date.now() - 3600 * 1000).toISOString() // il y a 1h
const FUTURE = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()

async function run() {
  const voyageurId = await makeUser(`boost-notif3-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const clientId = await makeUser(`boost-notif3-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const otherId = await makeUser(`boost-notif3-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const other = await signInSession(`boost-notif3-other-${ts}@example.com`, password)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // Trip expiré (à notifier), offer expirée (à notifier), request expirée
  // (à notifier), trip PAS expiré (ne doit jamais être notifié).
  const { data: expiredTrip } = await service.from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostNotif3FR', destination_city: 'BoostNotif3TN', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: PAST })
    .select('id').single()
  cleanup.trips.push(expiredTrip.id)

  const { data: activeTrip } = await service.from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostNotif3FR2', destination_city: 'BoostNotif3TN2', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: FUTURE })
    .select('id').single()
  cleanup.trips.push(activeTrip.id)

  const { data: expiredOffer } = await service.from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Boost notif3 offer ${ts}`, origin_country: 'BoostNotif3FR', destination_city: 'BoostNotif3TN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open', boosted_until: PAST })
    .select('id').single()
  cleanup.offers.push(expiredOffer.id)

  const { data: expiredRequest } = await service.from('travel_requests')
    .insert({ client_id: clientId, item_description: `Boost notif3 request ${ts}`, origin_country: 'BoostNotif3FR', destination_city: 'BoostNotif3TN', needed_by: travelDate, budget_max: 100, item_weight_kg: 1, status: 'open', boosted_until: PAST })
    .select('id').single()
  cleanup.requests.push(expiredRequest.id)

  // 1) Un authenticated non-admin ne peut pas exécuter la fonction (revoke,
  //    même posture que create_notification()).
  const { error: forbiddenErr } = await other.rpc('notify_expired_boosts')
  check('notify_expired_boosts() refusée à un authenticated normal (revoke)', !!forbiddenErr, { forbiddenErr })

  // 2) Premier run (service_role — équivalent du contexte pg_cron) :
  //    détecte les 3 items expirés, ignore le trip encore actif.
  const { data: run1, error: run1Err } = await service.rpc('notify_expired_boosts')
  check('notify_expired_boosts() (run 1) réussit', !run1Err, { run1Err })
  const run1Ids = (run1 ?? []).map((r) => r.item_id)
  check('run 1 traite le trip expiré', run1Ids.includes(expiredTrip.id), { run1 })
  check('run 1 traite l\'offre expirée', run1Ids.includes(expiredOffer.id), { run1 })
  check('run 1 traite la demande expirée', run1Ids.includes(expiredRequest.id), { run1 })
  check('run 1 ignore le trip encore actif', !run1Ids.includes(activeTrip.id), { run1 })

  const { data: tripNotif } = await service.from('notifications')
    .select('title, body, related_object_type, related_object_id')
    .eq('user_id', voyageurId).eq('type', 'boost_update').eq('related_object_id', expiredTrip.id).order('created_at', { ascending: false }).limit(1)
  check('notification "Boost terminé" créée pour le trip expiré', tripNotif?.[0]?.title === 'Boost terminé' && tripNotif?.[0]?.related_object_type === 'trip', { tripNotif })

  const { data: requestNotif } = await service.from('notifications')
    .select('title, related_object_type, related_object_id')
    .eq('user_id', clientId).eq('type', 'boost_update').eq('related_object_id', expiredRequest.id).limit(1)
  check('notification "Boost terminé" créée pour le client (request)', requestNotif?.[0]?.title === 'Boost terminé' && requestNotif?.[0]?.related_object_type === 'travel_request', { requestNotif })

  const { data: tripAfterRun1 } = await service.from('trips').select('boost_expiry_notified_at').eq('id', expiredTrip.id).single()
  check('boost_expiry_notified_at posé sur le trip après run 1', !!tripAfterRun1?.boost_expiry_notified_at, { tripAfterRun1 })

  // 3) Deuxième run immédiat : idempotence, aucun item retraité (déjà
  //    notifié, boost_expiry_notified_at >= boosted_until).
  const { data: run2 } = await service.rpc('notify_expired_boosts')
  const run2Ids = (run2 ?? []).map((r) => r.item_id)
  check('run 2 : le trip déjà notifié n\'est PAS retraité (idempotence)', !run2Ids.includes(expiredTrip.id), { run2 })

  const { count: tripNotifCount } = await service.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', voyageurId).eq('type', 'boost_update').eq('related_object_id', expiredTrip.id)
  check('une seule notification pour ce trip après 2 runs (pas de doublon)', tripNotifCount === 1, { tripNotifCount })

  // 4) Re-boost puis ré-expiration : doit redéclencher une notification
  //    (boost_expiry_notified_at < le nouveau boosted_until).
  await service.from('trips').update({ boosted_until: FUTURE }).eq('id', expiredTrip.id) // re-boost
  await new Promise((r) => setTimeout(r, 1100)) // laisse largement passer le boost_expiry_notified_at du run 1
  // Calculé APRÈS l'attente (pas avant) : doit être postérieur au
  // boost_expiry_notified_at posé par le run 1, sans quoi la condition
  // d'idempotence (boost_expiry_notified_at < boosted_until) resterait
  // fausse et le run 3 ignorerait ce trip à tort.
  const NEW_PAST = new Date(Date.now() - 100).toISOString()
  await service.from('trips').update({ boosted_until: NEW_PAST }).eq('id', expiredTrip.id) // ré-expiration

  const { data: run3 } = await service.rpc('notify_expired_boosts')
  const run3Ids = (run3 ?? []).map((r) => r.item_id)
  check('run 3 : re-détecte le trip après re-boost + ré-expiration', run3Ids.includes(expiredTrip.id), { run3 })

  const { count: tripNotifCountAfterReboost } = await service.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', voyageurId).eq('type', 'boost_update').eq('related_object_id', expiredTrip.id)
  check('2 notifications pour ce trip après re-boost + ré-expiration', tripNotifCountAfterReboost === 2, { tripNotifCountAfterReboost })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of [...cleanup.trips, ...cleanup.offers, ...cleanup.requests]) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
    }
    for (const id of cleanup.trips) { try { await service.from('trips').delete().eq('id', id) } catch {} }
    for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
    for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
