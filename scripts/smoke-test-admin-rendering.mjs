// Garde-fou de rendu HTTP réel pour les pages admin qui passent des
// Server Actions "bindées" (avec argument supplémentaire) à un composant
// client — la classe de bug qui a échappé aux tests DB/RPC directs tout
// au long de cette session : une closure (`(note) => action(id, note)`)
// compile et type-check sans erreur, mais fait planter le rendu React
// Server Components en dur ("Functions cannot be passed directly to
// Client Components...") — seul un vrai rendu HTTP le révèle.
//
// Usage : lance `npm run dev` dans un terminal, puis dans un autre :
//   node scripts/smoke-test-admin-rendering.mjs
//
// Ne fait PARTIE d'aucune suite de tests automatisée (aucun framework de
// test dans ce projet) — script manuel à relancer après toute page admin
// qui passe une Server Action bindée à un composant client.
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const value = trimmed.slice(eq + 1).trim()
  if (!(key in process.env)) process.env[key] = value
}

const BASE = process.env.SMOKE_TEST_BASE_URL ?? 'http://localhost:3000'
// Nommé SUPABASE_URL (pas URL) : `const URL = ...` masquerait le constructeur
// global `URL` dans toute la portée du module — bug réel trouvé en écrivant
// ce scénario (renderPage() plante dès qu'une redirection survient, `new
// URL(...)` résolvant vers la string du dessus au lieu du constructeur). Ne
// s'était jamais déclenché sur la branche flouci-incidents car ce scénario-là
// n'a jamais de redirection (admin déjà pleinement authentifié, pas de 2FA
// sur main) — seul le scénario /admin/2fa/verifier ci-dessous, qui suit une
// vraie redirection middleware, l'a révélé.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const service = createServiceClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0
let fail = 0
function check(label, cond, detail) {
  if (cond) {
    pass++
    console.log(`  OK  ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`)
  }
}

// Session avec les VRAIS cookies qu'un navigateur recevrait (même lib que
// l'app, @supabase/ssr) — pas une simulation, un vrai jeton exploitable
// par le middleware et les Server Components de l'app réelle.
//
// Retourne aussi le client `supabase` lié à cette session (pas seulement le
// cookie) : les scénarios 2FA en ont besoin pour enrôler/vérifier un facteur
// TOTP via le SDK réel (supabase.auth.mfa.*), exactement comme le ferait la
// Server Action de l'app — la mécanique MFA elle-même a déjà été éprouvée en
// direct plus tôt dans cette session, seul le RENDU de page est testé ici.
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
  const cookie = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { cookie, supabase }
}

// Génère un code TOTP (RFC 6238, HMAC-SHA1, 30s, 6 chiffres) à partir du
// secret base32 renvoyé par supabase.auth.mfa.enroll() — même algorithme
// qu'une vraie app d'authentification, pas besoin d'otplib (absent du
// projet) pour ces 6 lignes de RFC.
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

// GET une page avec une session admin, en suivant les redirections
// manuellement (pour détecter si on atterrit sur une page en erreur en
// bout de chaîne, pas seulement sur la première requête).
async function renderPage(path, cookie) {
  let current = path
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${BASE}${current}`, { headers: { cookie }, redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      current = new URL(location, BASE).pathname + new URL(location, BASE).search
      continue
    }
    const body = await res.text()
    return { status: res.status, finalPath: current, body }
  }
  throw new Error(`Trop de redirections en partant de ${path}`)
}

function assertRendersOk(label, result) {
  const isRscBoundaryError = result.body.includes('cannot be passed directly to Client Components')
  check(
    `${label} → ${result.finalPath} répond 200 (pas ${result.status})`,
    result.status === 200 && !isRscBoundaryError,
    isRscBoundaryError
      ? { status: result.status, error: 'RSC boundary violation (closure passée à un Client Component)' }
      : { status: result.status }
  )
}

async function makeAdmin(email, password) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({ role: 'admin', is_active: true }).eq('id', data.user.id)
  return data.user.id
}

// ============================================================================
// Scénario : /admin/flouci-incidents/[id] avec un incident non résolu
// (branche du composant qui expose ResolutionForm — celle qui plantait)
// ============================================================================
async function testFlouciIncidentDetail() {
  console.log('\n=== /admin/flouci-incidents/[id] (incident non résolu) ===')
  const ts = Date.now()
  const adminId = await makeAdmin(`smoke-admin-${ts}@example.com`, 'SmokeTestPass!23')
  const clientId = await makeAdmin(`smoke-client-${ts}@example.com`, 'SmokeTestPass!23')
  const voyageurId = await makeAdmin(`smoke-voyageur-${ts}@example.com`, 'SmokeTestPass!23')
  await service.from('profiles').update({ role: 'client' }).in('id', [clientId, voyageurId])

  const { data: req } = await service
    .from('travel_requests')
    .insert({ client_id: clientId, item_description: 'Smoke test', origin_country: 'France', destination_city: 'Tunis', budget_max: 50 })
    .select('id')
    .single()
  const { data: proposal } = await service
    .from('travel_proposals')
    .insert({ request_id: req.id, voyageur_id: voyageurId, item_price: 30, delivery_fee: 20 })
    .select('id')
    .single()
  const { data: incident, error: incidentErr } = await service
    .from('flouci_payment_incidents')
    .insert({
      travel_request_id: req.id,
      travel_proposal_id: proposal.id,
      client_id: clientId,
      flouci_payment_id: `smoke-${ts}`,
      amount: 50,
      error_message: 'smoke test',
    })
    .select('id')
    .single()

  if (incidentErr || !incident) {
    check('setup incident réussit', false, incidentErr)
  } else {
    const { cookie } = await signInSession(`smoke-admin-${ts}@example.com`, 'SmokeTestPass!23')
    const result = await renderPage(`/admin/flouci-incidents/${incident.id}`, cookie)
    assertRendersOk('/admin/flouci-incidents/[id]', result)
    await service.from('flouci_payment_incidents').delete().eq('id', incident.id)
  }

  await service.from('travel_proposals').delete().eq('id', proposal.id)
  await service.from('travel_requests').delete().eq('id', req.id)
  await service.auth.admin.deleteUser(adminId)
  await service.auth.admin.deleteUser(clientId)
  await service.auth.admin.deleteUser(voyageurId)
}

// ============================================================================
// Scénario : /admin/2fa (admin sans facteur MFA — page d'enrôlement, celle
// qui plantait avec la closure verifyAction={(factorId, code) => ...})
// ============================================================================
async function testAdmin2faEnrollPage() {
  console.log('\n=== /admin/2fa (admin non enrôlé) ===')
  const ts = Date.now()
  const email = `smoke-admin-2fa-enroll-${ts}@example.com`
  const adminId = await makeAdmin(email, 'SmokeTestPass!23')

  const { cookie } = await signInSession(email, 'SmokeTestPass!23')
  const result = await renderPage('/admin/2fa', cookie)
  assertRendersOk('/admin/2fa', result)

  await service.auth.admin.deleteUser(adminId)
}

// ============================================================================
// Scénario : /admin/2fa/verifier (admin avec facteur MFA déjà vérifié, mais
// SESSION FRAÎCHE — aal1 malgré le facteur, cas exact du bug rapporté sur le
// preview Vercel : verifyAction={(factorId, code) => verifyAdmin...(factorId,
// code, next)}). Enrôlement + vérification faits sur une 1ère session (celle
// qui passe à aal2), puis reconnexion dans une 2NDE session fraîche pour
// obtenir l'état aal1 que le middleware redirige vers cette page.
// ============================================================================
async function testAdmin2faVerifierPage() {
  console.log('\n=== /admin/2fa/verifier (admin enrôlé, session fraîche aal1) ===')
  const ts = Date.now()
  const email = `smoke-admin-2fa-verifier-${ts}@example.com`
  const password = 'SmokeTestPass!23'
  const adminId = await makeAdmin(email, password)

  const { supabase: enrollSession } = await signInSession(email, password)
  const { data: enrollData, error: enrollErr } = await enrollSession.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) {
    check('enrôlement TOTP setup réussit', false, { message: enrollErr.message })
  } else {
    const code = generateTotp(enrollData.totp.secret)
    const { error: verifyErr } = await enrollSession.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code })
    if (verifyErr) {
      check('vérification TOTP setup réussit', false, { message: verifyErr.message })
    } else {
      const { cookie } = await signInSession(email, password)
      const result = await renderPage('/admin/2fa/verifier', cookie)
      assertRendersOk('/admin/2fa/verifier', result)
    }
  }

  await service.auth.admin.deleteUser(adminId)
}

await testFlouciIncidentDetail()
await testAdmin2faEnrollPage()
await testAdmin2faVerifierPage()

console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
process.exit(fail > 0 ? 1 : 0)
