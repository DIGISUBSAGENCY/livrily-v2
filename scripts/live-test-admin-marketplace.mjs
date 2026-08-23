// Tests en direct de /admin/marketplace — rendu HTTP réel (données
// correctes, admin uniquement) + tri par onglet/statut/recherche. Mêmes
// conventions que les scripts précédents de cette session.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-admin-marketplace.mjs
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const service = createServiceClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }
}

async function makeUser(email, password, role) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  if (role) await service.from('profiles').update({ role }).eq('id', data.user.id)
  return data.user.id
}

function makeJarClient() {
  const jar = new Map()
  const supabase = createServerClient(SUPABASE_URL, ANON, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (toSet) => toSet.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const getCookie = () => Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { supabase, getCookie }
}

async function signInSession(email, password) {
  const { supabase, getCookie } = makeJarClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return { cookie: getCookie(), supabase, getCookie }
}

// TOTP RFC 6238 (mêmes 6 lignes que smoke-test-admin-rendering.mjs) — les
// comptes admin sont 2FA obligatoire (aal2), un compte fraîchement créé
// sans facteur enrôlé est redirigé vers /admin/2fa, pas la page demandée.
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

// Enrôle + vérifie un facteur TOTP sur une session (passe aal1 -> aal2) —
// pas besoin de reconnexion supplémentaire ensuite : le cookie de CETTE
// session, repris juste après challengeAndVerify(), est déjà aal2 et
// suffit pour rendre n'importe quelle page /admin/* protégée. Le flow
// aal1-fraîche-doit-revérifier est déjà couvert par
// smoke-test-admin-rendering.mjs, pas reproduit ici.
async function makeVerified2faCookie(email, password) {
  const { supabase, getCookie } = makeJarClient()
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign in: ${signInErr.message}`)
  const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) throw new Error(`enroll 2FA: ${enrollErr.message}`)
  const code = generateTotp(enrollData.totp.secret)
  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code })
  if (verifyErr) throw new Error(`verify 2FA: ${verifyErr.message}`)
  return getCookie()
}

async function renderPage(path, cookie) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' })
  const body = await res.text()
  return { status: res.status, body }
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const VOYAGEUR_NAME = `Marketplace Test Voyageur ${ts}`
const cleanup = { users: [], trips: [], offers: [] }

async function run() {
  const voyageurId = await makeUser(`mp-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  await service.from('profiles').update({ full_name: VOYAGEUR_NAME }).eq('id', voyageurId)

  const adminId = await makeUser(`mp-admin-${ts}@example.com`, password, 'admin')
  cleanup.users.push(adminId)
  const adminCookie = await makeVerified2faCookie(`mp-admin-${ts}@example.com`, password)

  const clientId = await makeUser(`mp-nonadmin-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const { cookie: clientCookie } = await signInSession(`mp-nonadmin-${ts}@example.com`, password)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const ORIGIN = `MPTestFR${ts}`
  const DEST = `MPTestTN${ts}`

  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: ORIGIN, destination_city: DEST, travel_date: travelDate, available_weight_kg: 10, indicative_price: 55, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(trip.id)

  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Marketplace test offer ${ts}`, origin_country: ORIGIN, destination_city: DEST, travel_date: travelDate, item_price: 300, delivery_fee: 45, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(offer.id)

  console.log('\n=== Scénario 1 : accès non-admin bloqué ===')
  {
    const result = await renderPage('/admin/marketplace', clientCookie)
    check('non-admin redirigé (pas 200 avec le contenu admin)', result.status !== 200 || !result.body.includes('Marketplace'), {
      status: result.status,
    })
  }

  console.log('\n=== Scénario 2 : onglet Trips (défaut), admin ===')
  {
    const result = await renderPage(`/admin/marketplace?q=${encodeURIComponent(ORIGIN)}`, adminCookie)
    check('200, pas d\'erreur RSC/runtime', result.status === 200 && !result.body.includes('cannot be passed directly to Client Components'))
    check('nom du voyageur affiché', result.body.includes(VOYAGEUR_NAME))
    check('route affichée', result.body.includes(ORIGIN) && result.body.includes(DEST))
    check('lien vers la fiche publique du trip', result.body.includes(`/jibli/trips/${trip.id}`))
    check('prix indicatif affiché (55.000 ou 55)', /55/.test(result.body))
  }

  console.log('\n=== Scénario 3 : onglet Offres, admin ===')
  {
    const result = await renderPage(`/admin/marketplace?type=offres&q=${encodeURIComponent(ORIGIN)}`, adminCookie)
    check('200, pas d\'erreur RSC/runtime', result.status === 200 && !result.body.includes('cannot be passed directly to Client Components'))
    check('description de l\'offre affichée', result.body.includes(`Marketplace test offer ${ts}`))
    check('nom du voyageur affiché', result.body.includes(VOYAGEUR_NAME))
    check('prix total affiché (345 = 300+45)', result.body.includes('345'))
    check('lien vers la fiche publique de l\'offre', result.body.includes(`/jibli/offres/${offer.id}`))
  }

  console.log('\n=== Scénario 4 : filtre statut exclut correctement ===')
  {
    const result = await renderPage(`/admin/marketplace?q=${encodeURIComponent(ORIGIN)}&status=matched`, adminCookie)
    check('200', result.status === 200)
    check('trip open absent quand filtré sur matched', !result.body.includes(ORIGIN) || !result.body.includes(VOYAGEUR_NAME), {
      note: 'le trip est status=open, filtré par status=matched, donc absent',
    })
  }

  await service.from('trips').delete().eq('id', trip.id)
  await service.from('product_offers').delete().eq('id', offer.id)
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
