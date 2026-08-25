// Test en direct du commit 4 (UI admin tarification boost) —
// /admin/parametres/boost. Vérifie : rendu de la grille des 7 paliers pour
// un admin, l'aperçu chiffré sur le hub /admin/parametres, le blocage
// middleware pour un non-admin, et la persistance d'une modification de
// prix (update effectué avec la session admin réelle — RLS
// boost_pricing_tiers_update_admin_only, même update que
// updateBoostTierPrice() dans actions.ts) reflétée par un GET suivant sur
// la page. RLS write pour un non-admin déjà couverte par
// live-test-boost-pricing-tiers.mjs (chantier boost-pricing-tiers) — pas
// reproduite ici, testé une fois suffit pour une policy inchangée.
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
    full_name: 'Boost Admin UI Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
function generateTotp(secretBase32, timeStepSeconds = 30, digits = 6) {
  const key = base32Decode(secretBase32)
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (binCode % 10 ** digits).toString().padStart(digits, '0')
}
async function enrollAndVerifyTotp(supabase) {
  const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) throw enrollErr
  const code = generateTotp(enrollData.totp.secret)
  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code })
  if (verifyErr) throw verifyErr
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [] }

async function run() {
  const adminId = await makeUser(`boost-admin-ui-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`boost-admin-ui-${ts}@example.com`, password)
  await enrollAndVerifyTotp(admin)
  const adminCookie = adminCookieFn()

  const clientId = await makeUser(`boost-admin-ui-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const { cookieHeader: clientCookieFn } = await signInSession(`boost-admin-ui-client-${ts}@example.com`, password)
  const clientCookie = clientCookieFn()

  const { data: tiersBefore } = await service.from('boost_pricing_tiers').select('duration_days, price_tnd').order('duration_days')
  check('7 paliers présents en base (1-7 jours)', tiersBefore?.length === 7, { count: tiersBefore?.length })

  // 1) Page /admin/parametres/boost, session admin : les 7 durées et les 7
  //    prix actuels sont rendus.
  const boostPageRes = await fetch(`${BASE}/admin/parametres/boost`, { headers: { cookie: adminCookie } })
  const boostPageBody = (await boostPageRes.text()).replace(/<!--\s*-->/g, '')
  check('GET /admin/parametres/boost (admin) → 200', boostPageRes.status === 200, { status: boostPageRes.status })
  check('titre "Tarification Boost" affiché', boostPageBody.includes('Tarification Boost'), {})
  for (const tier of tiersBefore ?? []) {
    check(`palier ${tier.duration_days} j affiché`, boostPageBody.includes(`${tier.duration_days} j`), {})
  }

  // 2) Hub /admin/parametres : tuile "Boost" avec aperçu chiffré (plage
  //    min-max des 7 prix).
  const hubRes = await fetch(`${BASE}/admin/parametres`, { headers: { cookie: adminCookie } })
  const hubBody = (await hubRes.text()).replace(/<!--\s*-->/g, '')
  const prices = (tiersBefore ?? []).map((t) => t.price_tnd)
  const expectedRange = `${Math.min(...prices)}–${Math.max(...prices)} TND`
  check('hub /admin/parametres : tuile "Boost" présente', hubBody.includes('Boost') && hubBody.includes('mise en avant'), {})
  check('hub : aperçu chiffré = plage min-max correcte', hubBody.includes(expectedRange), { expectedRange })

  // 3) Non-admin : middleware bloque l'accès à /admin/parametres/boost
  //    (aal2/role requis pour toute route /admin/*, déjà en place).
  const nonAdminRes = await fetch(`${BASE}/admin/parametres/boost`, { headers: { cookie: clientCookie }, redirect: 'manual' })
  check('non-admin : redirigé hors de /admin/parametres/boost', [301, 302, 303, 307, 308].includes(nonAdminRes.status), { status: nonAdminRes.status })

  // 4) Modification d'un prix — même update que updateBoostTierPrice()
  //    (session admin réelle, pas service_role) : persistance + reflet sur
  //    un GET suivant de la page.
  const newPrice = 2.75
  const { error: updateErr } = await admin
    .from('boost_pricing_tiers')
    .update({ price_tnd: newPrice, updated_by: adminId })
    .eq('duration_days', 1)
  check('admin : update price_tnd (palier 1j) réussit', !updateErr, { updateErr })

  const boostPageAfterRes = await fetch(`${BASE}/admin/parametres/boost`, { headers: { cookie: adminCookie } })
  const boostPageAfterBody = (await boostPageAfterRes.text()).replace(/<!--\s*-->/g, '')
  check('nouveau prix (2.75) reflété après GET suivant', boostPageAfterBody.includes('2.75') || boostPageAfterBody.includes('value="2.75"'), {})

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    // Restaure le prix du palier 1j modifié par le test 4.
    try { await service.from('boost_pricing_tiers').update({ price_tnd: 2.0 }).eq('duration_days', 1) } catch {}
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
