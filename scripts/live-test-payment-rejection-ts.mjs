// Test en direct du chantier admin completeness, point 2 (couche TS).
// La couche SQL est déjà couverte à 21/21 par
// live-test-payment-rejection-sql.mjs — ici : rendu des boutons
// Vérifier/Rejeter sur /admin/jibli-paiements et /admin/boost-paiements,
// formulaire de re-soumission sur /jibli/[id] (visible pour le client
// propriétaire seulement, paiement rejeté seulement), et deux parcours en
// VRAI navigateur (Server Actions non invocables en HTTP brut, limite
// documentée) : le client renvoie une preuve (cycle complet vérifié en
// base), l'admin rejette un paiement Boost (window.confirm accepté via le
// handler dialog Playwright, boosted_until recalculé vérifié en base).
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHmac } from 'node:crypto'
import { chromium } from '/Users/amir/node_modules/playwright-core/index.mjs'

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
    full_name: 'Rejection TS Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
async function enrollAndVerifyTotp(supabase) {
  const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) throw enrollErr
  const code = generateTotp(enrollData.totp.secret)
  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code })
  if (verifyErr) throw verifyErr
}

function cookiesForPlaywright(cookieHeader) {
  return cookieHeader.split('; ').map((pair) => {
    const idx = pair.indexOf('=')
    return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: 'localhost', path: '/' }
  })
}

// Attend qu'un prédicat DB devienne vrai (polling 1s) — plus fiable que
// d'observer le DOM après un clic : la vérité est en base, pas à l'écran.
async function waitForDb(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await new Promise((r) => setTimeout(r, 1000))
  }
  return predicate()
}

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
)
const proofPath = '/private/tmp/claude-501/-Users-amir-Desktop-jibli-v2/d1d0473c-e51d-4299-832d-496ac15aeb6c/scratchpad/rejection-proof.jpg'
writeFileSync(proofPath, TINY_JPEG)

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], requests: [], payments: [] }

async function run() {
  const clientId = await makeUser(`rejts-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const { supabase: client, cookieHeader: clientCookieFn } = await signInSession(`rejts-client-${ts}@example.com`, password)
  const clientCookie = clientCookieFn()

  const voyageurId = await makeUser(`rejts-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const { supabase: voyageur, cookieHeader: voyageurCookieFn } = await signInSession(`rejts-voyageur-${ts}@example.com`, password)
  const voyageurCookie = voyageurCookieFn()

  const adminId = await makeUser(`rejts-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`rejts-admin-${ts}@example.com`, password)
  await enrollAndVerifyTotp(admin)
  const adminCookie = adminCookieFn()

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // Setup mission : demande → proposition → acceptation virement → rejet
  // admin (l'update exact de rejectTravelPayment, session admin réelle).
  const { data: req } = await service.from('travel_requests')
    .insert({ client_id: clientId, item_description: `Rejts mission ${ts}`, origin_country: 'RejtsFR', destination_city: 'RejtsTN', needed_by: travelDate, budget_max: 200, status: 'open' })
    .select('id').single()
  cleanup.requests.push(req.id)
  const { data: prop } = await voyageur.from('travel_proposals')
    .insert({ request_id: req.id, voyageur_id: voyageurId, item_price: 100, delivery_fee: 30 })
    .select('id').single()
  await client.rpc('accept_travel_proposal', { p_proposal_id: prop.id, p_payment_method: 'virement', p_payment_proof_url: `${clientId}/travel-${req.id}.jpg` })
  await admin.from('travel_payments')
    .update({ status: 'rejected', verified_by: adminId, verified_at: new Date().toISOString() })
    .eq('request_id', req.id).eq('status', 'awaiting_verification')

  // ==========================================================================
  // 1. /jibli/[id] : formulaire de re-soumission — client oui, voyageur non
  // ==========================================================================
  console.log('\n=== 1. Formulaire de re-soumission sur /jibli/[id] ===')
  const ownerRes = await fetch(`${BASE}/jibli/${req.id}`, { headers: { cookie: clientCookie } })
  const ownerBody = await ownerRes.text()
  check('client propriétaire : formulaire présent (Renvoyer la preuve)', ownerBody.includes('Renvoyer la preuve'), {})
  check('badge "Preuve de virement refusée" affiché', ownerBody.includes('Preuve de virement refusée'), {})

  const voyageurRes = await fetch(`${BASE}/jibli/${req.id}`, { headers: { cookie: voyageurCookie } })
  const voyageurBody = await voyageurRes.text()
  check('voyageur : formulaire ABSENT', !voyageurBody.includes('Renvoyer la preuve'), {})

  // ==========================================================================
  // 2. Vrai navigateur : le client renvoie une preuve — cycle complet
  // ==========================================================================
  console.log('\n=== 2. Re-soumission réelle (navigateur) ===')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const clientCtx = await browser.newContext()
  await clientCtx.addCookies(cookiesForPlaywright(clientCookie))
  const clientPage = await clientCtx.newPage()
  await clientPage.goto(`${BASE}/jibli/${req.id}`, { waitUntil: 'networkidle' })
  // Attente d'hydratation explicite avant d'interagir (networkidle ne
  // garantit pas que les handlers React sont attachés — course constatée
  // en direct, le clic partait dans le vide), puis retry du clic tant que
  // la base n'a pas bougé.
  await clientPage.waitForTimeout(2000)
  await clientPage.locator('input[name="payment_proof"]').setInputFiles(proofPath)
  let resubmitted = false
  for (let attempt = 0; attempt < 3 && !resubmitted; attempt++) {
    await clientPage.getByRole('button', { name: 'Renvoyer la preuve' }).click().catch(() => {})
    resubmitted = await waitForDb(async () => {
      const { data } = await service.from('travel_payments').select('status').eq('request_id', req.id).single()
      return data?.status === 'awaiting_verification'
    }, 6000)
  }

  const { data: tpAfter } = await service.from('travel_payments')
    .select('status, payment_proof_url, verified_by').eq('request_id', req.id).single()
  check('paiement repassé à awaiting_verification en base', tpAfter?.status === 'awaiting_verification', { tpAfter })
  check('nouvelle preuve horodatée (chemin -resubmit-), verified_by vidé', /resubmit/.test(tpAfter?.payment_proof_url ?? '') && tpAfter?.verified_by === null, { tpAfter })
  await clientPage.close()
  await clientCtx.close()

  // ==========================================================================
  // 3. /admin/jibli-paiements : les DEUX boutons présents (paiement du
  //    step 2 est revenu en awaiting → listé)
  // ==========================================================================
  console.log('\n=== 3. /admin/jibli-paiements — Vérifier + Rejeter ===')
  const jibliRes = await fetch(`${BASE}/admin/jibli-paiements`, { headers: { cookie: adminCookie } })
  const jibliBody = await jibliRes.text()
  check('GET /admin/jibli-paiements → 200', jibliRes.status === 200, { status: jibliRes.status })
  check('bouton "Marquer vérifié" présent', jibliBody.includes('Marquer vérifié'), {})
  check('bouton "Rejeter" présent', jibliBody.includes('Rejeter'), {})

  // ==========================================================================
  // 4. /admin/boost-paiements : les deux boutons + rejet réel (navigateur,
  //    dialog confirm accepté) → replay vérifié en base
  // ==========================================================================
  console.log('\n=== 4. /admin/boost-paiements — rejet réel (navigateur) ===')
  const { data: trip } = await service.from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'RejtsFR', destination_city: 'RejtsTN', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString() })
    .select('id').single()
  cleanup.trips.push(trip.id)
  const { data: boostPay } = await service.from('boost_payments')
    .insert({ voyageur_id: voyageurId, trip_id: trip.id, payment_method: 'virement', payment_proof_url: 'https://example.com/boost.jpg', amount: 5, duration_days: 3, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(boostPay.id)

  const boostRes = await fetch(`${BASE}/admin/boost-paiements`, { headers: { cookie: adminCookie } })
  const boostBody = await boostRes.text()
  check('boutons Vérifier + Rejeter présents sur boost-paiements', boostBody.includes('Marquer vérifié') && boostBody.includes('Rejeter'), {})

  const adminCtx = await browser.newContext()
  await adminCtx.addCookies(cookiesForPlaywright(adminCookie))
  const adminPage = await adminCtx.newPage()
  // window.confirm : accepté automatiquement — sans ce handler, Playwright
  // rejette les dialogs par défaut et le rejet ne partirait jamais.
  adminPage.on('dialog', (dialog) => dialog.accept())
  await adminPage.goto(`${BASE}/admin/boost-paiements`, { waitUntil: 'networkidle' })
  // Même attente d'hydratation + retry que le parcours client ci-dessus.
  await adminPage.waitForTimeout(2000)
  let boostRejected = false
  for (let attempt = 0; attempt < 3 && !boostRejected; attempt++) {
    await adminPage.getByRole('button', { name: 'Rejeter' }).first().click().catch(() => {})
    boostRejected = await waitForDb(async () => {
      const { data } = await service.from('boost_payments').select('status').eq('id', boostPay.id).single()
      return data?.status === 'rejected'
    }, 6000)
  }

  const { data: boostPayAfter } = await service.from('boost_payments').select('status').eq('id', boostPay.id).single()
  check('paiement Boost rejeté en base après clic réel', boostPayAfter?.status === 'rejected', { boostPayAfter })
  const { data: tripAfter } = await service.from('trips').select('boosted_until').eq('id', trip.id).single()
  check('boosted_until recalculé à null (replay, seul paiement rejeté)', tripAfter?.boosted_until === null, { tripAfter })
  const { data: rejNotif } = await service.from('notifications')
    .select('title').eq('user_id', voyageurId).eq('type', 'boost_update').eq('related_object_id', trip.id).limit(1)
  check('notification "Virement rejeté" reçue par le payeur', rejNotif?.[0]?.title === 'Virement rejeté', { rejNotif })

  await browser.close()
  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    try { unlinkSync(proofPath) } catch {}
    for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
    for (const id of [...cleanup.trips, ...cleanup.requests]) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
    }
    for (const id of cleanup.requests) {
      try { await service.from('travel_payments').delete().eq('request_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
      // Demande d'abord (accepted_proposal_id référence la proposition),
      // propositions par cascade.
      try { await service.from('travel_requests').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.trips) { try { await service.from('boost_payments').delete().eq('trip_id', id); await service.from('trips').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
