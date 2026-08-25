// Test en direct du point 1 (chantier améliorations carte) : normalisation
// ville→pays dans lib/countryGeo.ts — "lyon"/"Paris"/"Marseille" doivent se
// regrouper sous "France" au lieu d'apparaître comme des pills séparées.
// Le repli texte doit rester actif pour toute valeur vraiment non reconnue.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-city-normalization.mjs
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

const BASE = 'http://localhost:3000'
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
    full_name: 'City Norm Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
  const cookieHeader = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { cookieHeader }
}

function flatten(body) {
  return body.replace(/<!--\s*-->/g, '')
}

function countFor(body, label) {
  const flat = flatten(body)
  const match = flat.match(new RegExp(`${label} → Tunisie[\\s\\S]{0,150}?font-semibold text-white">\\s*(\\d+)\\s*</span>`))
  return match ? Number(match[1]) : null
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const cleanup = { users: [], offers: [] }

async function run() {
  const userId = await makeUser(`city-norm-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`city-norm-${ts}@example.com`, password)

  const beforeRes = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const franceBefore = countFor(await beforeRes.text(), 'France') ?? 0

  console.log('\n=== 1. Normalisation ville → pays (lyon, Paris, Marseille → France) ===')
  for (const origin of ['lyon', 'Paris', 'Marseille']) {
    const { data: offer } = await service
      .from('product_offers')
      .insert({ voyageur_id: userId, item_description: `City norm ${origin} ${ts}`, origin_country: origin, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' })
      .select('id')
      .single()
    cleanup.offers.push(offer.id)
  }

  const res = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body = await res.text()
  const bodyFlat = flatten(body)
  check('page répond 200', res.status === 200, { status: res.status })

  check('"lyon" n\'apparaît PAS comme pill séparée', !bodyFlat.includes('lyon → Tunisie'))
  check('"Paris" n\'apparaît PAS comme pill séparée', !bodyFlat.includes('Paris → Tunisie'))
  check('"Marseille" n\'apparaît PAS comme pill séparée', !bodyFlat.includes('Marseille → Tunisie'))

  const franceAfter = countFor(body, 'France')
  check('count "France" a augmenté de +3 (lyon+Paris+Marseille regroupées, pas 3 pills séparées)', franceAfter === franceBefore + 3, {
    franceBefore, franceAfter,
  })

  console.log('\n=== 2. Repli texte toujours actif pour une valeur vraiment non reconnue ===')
  const FAKE_CITY = `VilleInconnue${ts}`
  const { data: fakeOffer } = await service
    .from('product_offers')
    .insert({ voyageur_id: userId, item_description: `City norm fake ${ts}`, origin_country: FAKE_CITY, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(fakeOffer.id)

  const res2 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body2Flat = flatten(await res2.text())
  check(`"${FAKE_CITY}" apparaît toujours en repli texte (pas de perte de donnée silencieuse)`, body2Flat.includes(`${FAKE_CITY} → Tunisie`))

  // Cleanup
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
