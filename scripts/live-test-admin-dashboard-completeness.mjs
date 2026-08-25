// Test en direct du chantier admin completeness, point 1 — le tableau de
// bord /admin intègre Boost et Portefeuille. Vérifie : les 6 tuiles de
// raccourci présentes avec les bons href, les badges de comptage
// apparaissent quand des éléments sont réellement en attente (créés en
// base pour le test), le compteur "Paiements en attente (total)" agrège
// les 5 files, et un dépôt Flouci en attente n'est PAS compté (même filtre
// virement que /admin/portefeuille-paiements — se résout tout seul).
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
    full_name: 'Admin Dash Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], payments: [], deposits: [], withdrawals: [] }

async function run() {
  const clientId = await makeUser(`admdash-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const adminId = await makeUser(`admdash-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`admdash-admin-${ts}@example.com`, password)
  const { data: enrollData } = await admin.auth.mfa.enroll({ factorType: 'totp' })
  await admin.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code: generateTotp(enrollData.totp.secret) })
  const adminCookie = adminCookieFn()

  // État de référence AVANT nos insertions (la base partagée peut déjà
  // contenir des éléments en attente — on teste des DELTAS, pas des
  // valeurs absolues).
  async function counts() {
    const [b, d, w] = await Promise.all([
      service.from('boost_payments').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_verification'),
      service.from('wallet_deposits').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_verification').eq('payment_method', 'virement'),
      service.from('wallet_withdrawals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    return { boost: b.count ?? 0, deposits: d.count ?? 0, withdrawals: w.count ?? 0 }
  }

  // Crée un élément en attente dans chacune des 3 nouvelles files + un
  // dépôt Flouci (qui ne doit PAS compter).
  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: trip } = await service.from('trips')
    .insert({ voyageur_id: clientId, origin_country: 'AdmDashFR', destination_city: 'AdmDashTN', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() })
    .select('id').single()
  cleanup.trips.push(trip.id)
  const { data: boostPay } = await service.from('boost_payments')
    .insert({ voyageur_id: clientId, trip_id: trip.id, payment_method: 'virement', payment_proof_url: 'https://example.com/b.jpg', amount: 5, duration_days: 3, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(boostPay.id)
  const { data: dep } = await service.from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 33, payment_method: 'virement', payment_proof_url: 'https://example.com/d.jpg', status: 'awaiting_verification' })
    .select('id').single()
  cleanup.deposits.push(dep.id)
  const { data: flouciDep } = await service.from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 44, payment_method: 'flouci', status: 'awaiting_verification' })
    .select('id').single()
  cleanup.deposits.push(flouciDep.id)
  const { data: wd } = await service.from('wallet_withdrawals')
    .insert({ profile_id: clientId, amount: 10, status: 'pending' })
    .select('id').single()
  cleanup.withdrawals.push(wd.id)

  const after = await counts()

  console.log('\n=== 1. Rendu du dashboard admin ===')
  const res = await fetch(`${BASE}/admin`, { headers: { cookie: adminCookie } })
  const body = (await res.text()).replace(/<!--\s*-->/g, '')
  check('GET /admin → 200', res.status === 200, { status: res.status })

  console.log('\n=== 2. Les 6 tuiles avec les bons href ===')
  for (const href of ['/admin/jibli-paiements', '/admin/boost-paiements', '/admin/portefeuille-paiements', '/admin/portefeuille-retraits', '/admin/retraits', '/admin/verifications']) {
    check(`tuile href="${href}" présente`, body.includes(`href="${href}"`), {})
  }
  check('libellé "Paiements Boost" présent', body.includes('Paiements Boost'), {})
  check('libellé "Dépôts portefeuille" présent', body.includes('Dépôts portefeuille'), {})
  check('libellé "Retraits portefeuille" présent', body.includes('Retraits portefeuille'), {})

  console.log('\n=== 3. Badges de comptage (valeurs réelles de la base) ===')
  // Chaque tuile : extrait le segment HTML entre son href et la tuile
  // suivante, et vérifie que le badge y affiche le compte exact.
  function tileSegment(href) {
    const start = body.indexOf(`href="${href}"`)
    if (start === -1) return ''
    const next = body.indexOf('href="/admin/', start + 10)
    return next === -1 ? body.slice(start) : body.slice(start, next)
  }
  check(`badge Boost = ${after.boost}`, tileSegment('/admin/boost-paiements').includes(`>${after.boost}<`), { segment: tileSegment('/admin/boost-paiements').slice(-120) })
  check(`badge Dépôts portefeuille = ${after.deposits} (Flouci exclu)`, tileSegment('/admin/portefeuille-paiements').includes(`>${after.deposits}<`), { expected: after.deposits })
  check(`badge Retraits portefeuille = ${after.withdrawals}`, tileSegment('/admin/portefeuille-retraits').includes(`>${after.withdrawals}<`), { expected: after.withdrawals })

  console.log('\n=== 4. Total "Paiements en attente" agrège les 5 files ===')
  const [t, w2] = await Promise.all([
    service.from('travel_payments').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_verification'),
    service.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const expectedTotal = (t.count ?? 0) + (w2.count ?? 0) + after.boost + after.deposits + after.withdrawals
  check(`total = ${expectedTotal} (escrow + retraits gains + boost + dépôts/retraits portefeuille)`,
    body.includes(`>${expectedTotal}</p><p class="text-sm text-slate-500">Paiements en attente (total)`) || new RegExp(`>${expectedTotal}<\\/p><p[^>]*>Paiements en attente`).test(body), { expectedTotal })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
    for (const id of cleanup.deposits) { try { await service.from('wallet_deposits').delete().eq('id', id) } catch {} }
    for (const id of cleanup.withdrawals) { try { await service.from('wallet_withdrawals').delete().eq('id', id) } catch {} }
    for (const id of cleanup.trips) { try { await service.from('boost_payments').delete().eq('trip_id', id); await service.from('trips').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
