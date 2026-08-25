// Test en direct du chantier admin completeness, point 3 — onglet "Boosts
// actifs" sur /admin/marketplace. Vérifie : l'onglet existe, liste un item
// boosté de CHAQUE type (trip/offre/demande) avec propriétaire + date
// d'expiration + lien vers la fiche, exclut un item dont le boost est
// EXPIRÉ et un item jamais boosté, tri par expiration croissante, et les
// onglets Trips/Offres existants inchangés.
import { readFileSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHmac } from 'node:crypto'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim()
  if (!(k in process.env)) process.env[k] = v
}

const BASE = 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = createServiceClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }
}

async function makeUser(email, password, extra) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: 'Boosts Actifs Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
  const cookieHeader = () => Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { supabase, cookieHeader }
}

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of base32.replace(/=+$/, '').toUpperCase()) {
    const val = alphabet.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function generateTotp(secretBase32) {
  const key = base32Decode(secretBase32)
  const counter = Math.floor(Date.now() / 1000 / 30)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (binCode % 1e6).toString().padStart(6, '0')
}

const DAY = 24 * 3600 * 1000
const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], offers: [], requests: [] }

async function run() {
  const ownerId = await makeUser(`activeboost-owner-${ts}@example.com`, password)
  cleanup.users.push(ownerId)
  const adminId = await makeUser(`activeboost-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`activeboost-admin-${ts}@example.com`, password)
  const { data: enrollData } = await admin.auth.mfa.enroll({ factorType: 'totp' })
  await admin.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code: generateTotp(enrollData.totp.secret) })
  const adminCookie = adminCookieFn()

  const travelDate = new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10)

  // Un item boosté de chaque type (expirations échelonnées pour le tri),
  // + un trip au boost EXPIRÉ + un trip jamais boosté (les deux exclus).
  const { data: boostedTrip } = await service.from('trips')
    .insert({ voyageur_id: ownerId, origin_country: `ActiveBoostFR-${ts}`, destination_city: 'ActiveBoostTN', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: new Date(Date.now() + 1 * DAY).toISOString() })
    .select('id').single()
  cleanup.trips.push(boostedTrip.id)
  const { data: boostedOffer } = await service.from('product_offers')
    .insert({ voyageur_id: ownerId, item_description: `ActiveBoost offre ${ts}`, origin_country: `ActiveBoostFR-${ts}`, destination_city: 'ActiveBoostTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open', boosted_until: new Date(Date.now() + 2 * DAY).toISOString() })
    .select('id').single()
  cleanup.offers.push(boostedOffer.id)
  const { data: boostedRequest } = await service.from('travel_requests')
    .insert({ client_id: ownerId, item_description: `ActiveBoost demande ${ts}`, origin_country: `ActiveBoostFR-${ts}`, destination_city: 'ActiveBoostTN', needed_by: travelDate, budget_max: 100, status: 'open', boosted_until: new Date(Date.now() + 3 * DAY).toISOString() })
    .select('id').single()
  cleanup.requests.push(boostedRequest.id)
  const { data: expiredTrip } = await service.from('trips')
    .insert({ voyageur_id: ownerId, origin_country: `ActiveBoostExpired-${ts}`, destination_city: 'ActiveBoostTN', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: new Date(Date.now() - 1 * DAY).toISOString() })
    .select('id').single()
  cleanup.trips.push(expiredTrip.id)
  const { data: plainTrip } = await service.from('trips')
    .insert({ voyageur_id: ownerId, origin_country: `ActiveBoostPlain-${ts}`, destination_city: 'ActiveBoostTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id').single()
  cleanup.trips.push(plainTrip.id)

  console.log('\n=== 1. Onglet Boosts actifs ===')
  const res = await fetch(`${BASE}/admin/marketplace?type=boosts`, { headers: { cookie: adminCookie } })
  const body = (await res.text()).replace(/<!--\s*-->/g, '')
  check('GET /admin/marketplace?type=boosts → 200', res.status === 200, { status: res.status })
  check('onglet "Boosts actifs" présent dans la barre', body.includes('Boosts actifs'), {})

  console.log('\n=== 2. Les 3 types boostés listés (item + proprio + expiration + lien) ===')
  check('trip boosté listé (lien fiche)', body.includes(`href="/jibli/trips/${boostedTrip.id}"`), {})
  check('offre boostée listée (lien fiche)', body.includes(`href="/jibli/offres/${boostedOffer.id}"`), {})
  check('demande boostée listée (lien fiche)', body.includes(`href="/jibli/${boostedRequest.id}"`), {})
  check('propriétaire affiché', body.includes('Boosts Actifs Test'), {})
  check('date d\'expiration affichée ("En avant jusqu\'au")', body.includes('En avant jusqu'), {})
  check('libellés de type Trip/Offre/Demande présents', body.includes('>Trip<') && body.includes('>Offre<') && body.includes('>Demande<'), {})

  console.log('\n=== 3. Exclusions ===')
  check('trip au boost EXPIRÉ absent', !body.includes(`href="/jibli/trips/${expiredTrip.id}"`), {})
  check('trip jamais boosté absent', !body.includes(`href="/jibli/trips/${plainTrip.id}"`), {})

  console.log('\n=== 4. Tri par expiration croissante ===')
  const iTrip = body.indexOf(`href="/jibli/trips/${boostedTrip.id}"`)
  const iOffer = body.indexOf(`href="/jibli/offres/${boostedOffer.id}"`)
  const iRequest = body.indexOf(`href="/jibli/${boostedRequest.id}"`)
  check('ordre = trip (+1j) < offre (+2j) < demande (+3j)', iTrip !== -1 && iTrip < iOffer && iOffer < iRequest, { iTrip, iOffer, iRequest })

  console.log('\n=== 5. Onglets existants inchangés ===')
  const tripsRes = await fetch(`${BASE}/admin/marketplace?type=trips`, { headers: { cookie: adminCookie } })
  const tripsBody = await tripsRes.text()
  check('onglet Trips : 200 + trips listés', tripsRes.status === 200 && tripsBody.includes(`href="/jibli/trips/${plainTrip.id}"`), { status: tripsRes.status })
  const offresRes = await fetch(`${BASE}/admin/marketplace?type=offres`, { headers: { cookie: adminCookie } })
  const offresBody = await offresRes.text()
  check('onglet Offres : 200 + offres listées', offresRes.status === 200 && offresBody.includes(`href="/jibli/offres/${boostedOffer.id}"`), { status: offresRes.status })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.trips) { try { await service.from('trips').delete().eq('id', id) } catch {} }
    for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
    for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
