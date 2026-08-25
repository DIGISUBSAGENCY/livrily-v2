// Test en direct du commit 2 (portefeuille — dépôt Flouci), couche
// TypeScript/HTTP. Contrairement à initiateWalletDepositFlouci (Server
// Action, non invocable en HTTP brut), la route de callback
// (/api/flouci/wallet-callback) est un vrai Route Handler — testable via
// fetch normal. Couvre : garde-fous de la route (deposit_id manquant, non
// authentifié, dépôt d'un autre utilisateur), le chemin failLink (marque
// rejected sans jamais appeler Flouci), le chemin payment_id présent avec
// Flouci non configuré dans cet environnement (FLOUCI_APP_TOKEN/SECRET
// vides — catch de FlouciConfigError, jamais un crash), le filtre
// payment_method='virement' sur /admin/portefeuille-paiements, et (vrai
// navigateur, Playwright) le clic réel sur "Payer avec Flouci" qui doit
// afficher l'erreur "pas encore configuré" — seul moyen de tester
// initiateWalletDepositFlouci elle-même, cf. limite documentée sur les
// Server Actions plus tôt dans ce projet.
import { readFileSync } from 'node:fs'
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
    full_name: 'Wallet Flouci TS Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
const cleanup = { users: [], deposits: [] }

async function run() {
  const clientId = await makeUser(`wallet-flouci-ts-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const { cookieHeader: clientCookieFn } = await signInSession(`wallet-flouci-ts-${ts}@example.com`, password)
  const clientCookie = clientCookieFn()

  const otherId = await makeUser(`wallet-flouci-ts-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const { cookieHeader: otherCookieFn } = await signInSession(`wallet-flouci-ts-other-${ts}@example.com`, password)
  const otherCookie = otherCookieFn()

  const adminId = await makeUser(`wallet-flouci-ts-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`wallet-flouci-ts-admin-${ts}@example.com`, password)
  await enrollAndVerifyTotp(admin)
  const adminCookie = adminCookieFn()

  // ==========================================================================
  // 1. Garde-fous de la route de callback
  // ==========================================================================
  console.log('\n=== 1. Garde-fous /api/flouci/wallet-callback ===')

  const noDepositRes = await fetch(`${BASE}/api/flouci/wallet-callback`, { redirect: 'manual' })
  check('deposit_id manquant → redirige vers /parrainage?flouci=error', noDepositRes.headers.get('location')?.includes('/parrainage?flouci=error'), { location: noDepositRes.headers.get('location') })

  const { data: depositForGuards } = await service
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 10, payment_method: 'flouci' })
    .select('id').single()
  cleanup.deposits.push(depositForGuards.id)

  const notAuthRes = await fetch(`${BASE}/api/flouci/wallet-callback?deposit_id=${depositForGuards.id}`, { redirect: 'manual' })
  check('non authentifié → redirige vers /login', notAuthRes.headers.get('location')?.includes('/login'), { location: notAuthRes.headers.get('location') })

  const wrongOwnerRes = await fetch(`${BASE}/api/flouci/wallet-callback?deposit_id=${depositForGuards.id}`, { headers: { cookie: otherCookie }, redirect: 'manual' })
  check('dépôt d\'un autre utilisateur → redirige flouci=error', wrongOwnerRes.headers.get('location')?.includes('/parrainage?flouci=error'), { location: wrongOwnerRes.headers.get('location') })
  const { data: depositAfterWrongOwner } = await service.from('wallet_deposits').select('status').eq('id', depositForGuards.id).single()
  check('statut inchangé après tentative par un autre utilisateur', depositAfterWrongOwner?.status === 'awaiting_verification', { depositAfterWrongOwner })

  // ==========================================================================
  // 2. failLink (result=failed) — marque rejected, jamais d'appel Flouci
  // ==========================================================================
  console.log('\n=== 2. failLink (échec/abandon) ===')
  const { data: depositFail } = await service
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 20, payment_method: 'flouci' })
    .select('id').single()
  cleanup.deposits.push(depositFail.id)

  const failRes = await fetch(`${BASE}/api/flouci/wallet-callback?deposit_id=${depositFail.id}&result=failed`, { headers: { cookie: clientCookie }, redirect: 'manual' })
  check('result=failed → redirige flouci=failed', failRes.headers.get('location')?.includes('/parrainage?flouci=failed'), { location: failRes.headers.get('location') })
  const { data: depositAfterFail } = await service.from('wallet_deposits').select('status').eq('id', depositFail.id).single()
  check('statut passé à rejected', depositAfterFail?.status === 'rejected', { depositAfterFail })

  // ==========================================================================
  // 3. payment_id présent, Flouci NON configuré dans cet environnement —
  //    verifyFlouciPayment lève FlouciConfigError, catchée proprement.
  // ==========================================================================
  console.log('\n=== 3. payment_id présent, Flouci non configuré (catch propre) ===')
  const { data: depositUnconfigured } = await service
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 30, payment_method: 'flouci' })
    .select('id').single()
  cleanup.deposits.push(depositUnconfigured.id)

  const unconfiguredRes = await fetch(`${BASE}/api/flouci/wallet-callback?deposit_id=${depositUnconfigured.id}&payment_id=fake-payment-id`, { headers: { cookie: clientCookie }, redirect: 'manual' })
  check('payment_id présent mais Flouci non configuré → redirige flouci=error (pas de crash HTTP 500)', unconfiguredRes.headers.get('location')?.includes('/parrainage?flouci=error'), { status: unconfiguredRes.status, location: unconfiguredRes.headers.get('location') })
  const { data: depositAfterUnconfigured } = await service.from('wallet_deposits').select('status').eq('id', depositUnconfigured.id).single()
  check('statut toujours awaiting_verification (jamais crédité ni rejeté sur une simple erreur de config)', depositAfterUnconfigured?.status === 'awaiting_verification', { depositAfterUnconfigured })

  // ==========================================================================
  // 4. Filtre admin : un dépôt flouci en attente n'apparaît PAS sur
  //    /admin/portefeuille-paiements, un virement en attente oui.
  // ==========================================================================
  console.log('\n=== 4. Filtre admin (virement uniquement) ===')
  const { data: virementPending } = await service
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 77, payment_method: 'virement', payment_proof_url: 'https://example.com/proof-flouci-commit.jpg' })
    .select('id').single()
  cleanup.deposits.push(virementPending.id)

  const adminPageRes = await fetch(`${BASE}/admin/portefeuille-paiements`, { headers: { cookie: adminCookie } })
  const adminPageBody = await adminPageRes.text()
  check('virement en attente listé', adminPageBody.includes('77.000') || adminPageBody.includes('77,000'), {})
  check('dépôt flouci en attente (30 TND) absent de la liste admin', !adminPageBody.includes('30.000') && !adminPageBody.includes('30,000'), {})

  // ==========================================================================
  // 5. /parrainage : sélecteur de méthode Virement/Flouci présent.
  //
  // Chantier brique 4/N (restructuration en onglets) : ce sélecteur vit
  // dans l'onglet "Portefeuille", pas rendu dans le DOM réel par défaut
  // (onglet "Parrainage" actif au premier chargement) — ?flouci=success
  // force ce défaut côté serveur, même mécanique qu'un vrai retour de
  // paiement Flouci (cf. ParrainageTabs/page.tsx).
  // ==========================================================================
  console.log('\n=== 5. /parrainage — sélecteur de méthode ===')
  const parrainageRes = await fetch(`${BASE}/parrainage?flouci=success`, { headers: { cookie: clientCookie } })
  const parrainageBody = await parrainageRes.text()
  check('bouton "Virement" présent', parrainageBody.includes('>Virement<'), {})
  check('bouton "Flouci" présent', parrainageBody.includes('>Flouci<'), {})

  // ==========================================================================
  // 6. Vrai navigateur (Playwright) : clic "Payer avec Flouci" → erreur
  //    "pas encore configuré" affichée. Seul moyen de tester
  //    initiateWalletDepositFlouci elle-même (Server Action).
  // ==========================================================================
  console.log('\n=== 6. Clic réel "Payer avec Flouci" (navigateur) ===')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext()
  await context.addCookies(
    clientCookie.split('; ').map((pair) => {
      const idx = pair.indexOf('=')
      return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: 'localhost', path: '/' }
    })
  )
  const page = await context.newPage()
  await page.goto(`${BASE}/parrainage`, { waitUntil: 'networkidle' })
  // Chantier brique 4/N (restructuration en onglets) : "Portefeuille" doit
  // être ouvert AVANT de chercher le formulaire de dépôt (onglet
  // "Parrainage" actif par défaut sans ?flouci=...).
  await page.getByRole('button', { name: 'Portefeuille', exact: true }).click()
  // Montant obligatoire AVANT le clic : handleFlouci() valide le montant
  // côté client avant d'appeler la Server Action — sans ça, l'erreur
  // affichée serait "Indique un montant valide.", pas le message "pas
  // configuré" qu'on veut réellement exercer ici.
  await page.getByLabel('Montant à déposer (TND)').fill('12')
  // Attente explicite d'hydratation : première compilation de cette route
  // par le serveur dev dans cette session (peut prendre plusieurs secondes,
  // cf. logs dev) — networkidle seul ne garantit pas que les onClick React
  // sont déjà attachés. Réessaie le clic si le panneau Flouci n'apparaît
  // pas du premier coup plutôt que d'échouer sur une simple course
  // d'hydratation.
  const payFlouciButton = page.getByRole('button', { name: /Payer avec Flouci/ })
  let flouciPanelVisible = false
  for (let attempt = 0; attempt < 5 && !flouciPanelVisible; attempt++) {
    await page.getByRole('button', { name: 'Flouci', exact: true }).click()
    flouciPanelVisible = await payFlouciButton.isVisible().catch(() => false)
    if (!flouciPanelVisible) await page.waitForTimeout(1000)
  }
  check('panneau Flouci visible après clic sur l\'onglet (avec ré-essai hydratation)', flouciPanelVisible, {})

  await payFlouciButton.click()
  const errorLocator = page.getByText("Le paiement Flouci n'est pas encore configuré")
  await errorLocator.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  const errorVisible = await errorLocator.isVisible().catch(() => false)
  check('erreur "pas encore configuré" affichée après clic réel', errorVisible, {})
  await browser.close()

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.deposits) { try { await service.from('wallet_deposits').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
