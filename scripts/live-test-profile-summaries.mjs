// Tests en direct de get_public_profile_summaries() + son intégration sur
// les 3 pages listing (avatar/nom sur TripCard/ProductOfferCard/
// RequestCard). Mêmes conventions que les scripts précédents.
//
// Usage :
//   node scripts/live-test-profile-summaries.mjs            (RPC + grants)
//   RUN_HTTP=1 avec `npm run dev` actif pour inclure le rendu HTTP.
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

async function makeUser(email, password, fullName) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({ full_name: fullName }).eq('id', data.user.id)
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
const ORIGIN = `TestAvatarFR${ts}`
const DEST = `TestAvatarTN${ts}`
const FULL_NAME = `Mohamed Test ${ts}`
const cleanup = { users: [], trips: [], offers: [], requests: [] }

async function run() {
  const password = 'LiveTestPass!23'
  const voyageurId = await makeUser(`avatar-voyageur-${ts}@example.com`, password, FULL_NAME)
  cleanup.users.push(voyageurId)
  const anon = createAnonClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { supabase: someUser } = await signInSession(`avatar-voyageur-${ts}@example.com`, password)

  // ==========================================================================
  // Scénario 1 : RPC directe — nom correct, forme batchée, grants anon +
  // authenticated.
  // ==========================================================================
  console.log('\n=== Scénario 1 : get_public_profile_summaries() — RPC directe ===')
  {
    const { data: anonData, error: anonErr } = await anon.rpc('get_public_profile_summaries', {
      p_profile_ids: [voyageurId],
    })
    check('anon : pas d\'erreur', !anonErr, { anonErr })
    check('anon : nom correct renvoyé', anonData?.[0]?.full_name === FULL_NAME, { anonData })

    const { data: authData, error: authErr } = await someUser.rpc('get_public_profile_summaries', {
      p_profile_ids: [voyageurId],
    })
    check('authenticated : pas d\'erreur', !authErr, { authErr })
    check('authenticated : nom correct renvoyé', authData?.[0]?.full_name === FULL_NAME, { authData })

    // Batch : plusieurs ids en un appel, y compris un id inexistant (ne
    // doit pas planter, juste absent du résultat).
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { data: batchData, error: batchErr } = await anon.rpc('get_public_profile_summaries', {
      p_profile_ids: [voyageurId, fakeId],
    })
    check('batch (id réel + id inexistant) : pas d\'erreur', !batchErr, { batchErr })
    check('batch : seul l\'id réel est renvoyé (1 ligne, pas 2)', (batchData ?? []).length === 1, { batchData })
  }

  // ==========================================================================
  // Scénario 2 : fixtures pour le rendu HTTP — 1 trip, 1 offer, 1 request,
  // tous publiés par le même voyageur nommé, pour vérifier nom+avatar sur
  // les 3 cartes.
  // ==========================================================================
  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: ORIGIN, destination_city: DEST, travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(trip.id)

  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Avatar test offer ${ts}`, origin_country: ORIGIN, destination_city: DEST, travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(offer.id)

  const { data: request } = await service
    .from('travel_requests')
    .insert({ client_id: voyageurId, item_description: `Avatar test request ${ts}`, origin_country: ORIGIN, destination_city: DEST, budget_max: 100, status: 'open' })
    .select('id')
    .single()
  cleanup.requests.push(request.id)

  if (process.env.RUN_HTTP === '1') {
    console.log('\n=== Scénario 3 : rendu HTTP réel des 3 listings (nom affiché) ===')

    const tripsRes = await fetch(`${BASE}/jibli/trips?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DEST)}`)
    const tripsBody = await tripsRes.text()
    check('/jibli/trips répond 200', tripsRes.status === 200, { status: tripsRes.status })
    check('/jibli/trips : pas d\'erreur RSC/runtime', !tripsBody.includes('cannot be passed directly to Client Components') && !tripsBody.includes('Application error'))
    check('/jibli/trips : nom du voyageur affiché sur la carte', tripsBody.includes(FULL_NAME), { hasName: tripsBody.includes(FULL_NAME) })

    const offersRes = await fetch(`${BASE}/jibli/offres?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DEST)}`)
    const offersBody = await offersRes.text()
    check('/jibli/offres répond 200', offersRes.status === 200, { status: offersRes.status })
    check('/jibli/offres : pas d\'erreur RSC/runtime', !offersBody.includes('cannot be passed directly to Client Components') && !offersBody.includes('Application error'))
    check('/jibli/offres : nom du voyageur affiché sur la carte', offersBody.includes(FULL_NAME), { hasName: offersBody.includes(FULL_NAME) })

    const jibliRes = await fetch(`${BASE}/jibli?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DEST)}`)
    const jibliBody = await jibliRes.text()
    check('/jibli répond 200', jibliRes.status === 200, { status: jibliRes.status })
    check('/jibli : pas d\'erreur RSC/runtime', !jibliBody.includes('cannot be passed directly to Client Components') && !jibliBody.includes('Application error'))
    check('/jibli : nom du client affiché sur la carte', jibliBody.includes(FULL_NAME), { hasName: jibliBody.includes(FULL_NAME) })
  } else {
    console.log('\n(Scénario 3 sauté — relancer avec RUN_HTTP=1 et `npm run dev` actif pour inclure le rendu HTTP)')
  }

  // Cleanup
  for (const id of cleanup.trips) await service.from('trips').delete().eq('id', id)
  for (const id of cleanup.offers) await service.from('product_offers').delete().eq('id', id)
  for (const id of cleanup.requests) await service.from('travel_requests').delete().eq('id', id)
  for (const id of cleanup.users) await service.auth.admin.deleteUser(id)

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.trips) await service.from('trips').delete().eq('id', id).catch(() => {})
  for (const id of cleanup.offers) await service.from('product_offers').delete().eq('id', id).catch(() => {})
  for (const id of cleanup.requests) await service.from('travel_requests').delete().eq('id', id).catch(() => {})
  for (const id of cleanup.users) await service.auth.admin.deleteUser(id).catch(() => {})
  process.exit(1)
})
