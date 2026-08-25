// Test en direct du commit 3 (portefeuille — retrait), couche TypeScript.
// Couvre : rendu du formulaire/historique sur /parrainage, page admin
// /admin/portefeuille-retraits (liste + boutons), blocage non-admin, lien
// AdminNav (vérification source, même raisonnement que le commit 1 —
// dropdown fermé par défaut, jamais dans le HTML initial). requestWalletWithdrawal
// étant une Server Action (non invocable en HTTP brut), le clic réel sur
// "Demander le retrait" est testé avec un vrai navigateur (Playwright +
// Chrome système, même technique que le chantier popup boost et le commit 2
// Flouci de ce chantier).
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
    full_name: 'Wallet Withdrawal TS Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
const cleanup = { users: [], withdrawals: [] }

async function run() {
  const clientId = await makeUser(`wallet-wd-ts-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const { cookieHeader: clientCookieFn } = await signInSession(`wallet-wd-ts-${ts}@example.com`, password)
  const clientCookie = clientCookieFn()

  const adminId = await makeUser(`wallet-wd-ts-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`wallet-wd-ts-admin-${ts}@example.com`, password)
  await enrollAndVerifyTotp(admin)
  const adminCookie = adminCookieFn()

  await service.from('profiles').update({ wallet_balance: 100 }).eq('id', clientId)

  // ==========================================================================
  // 1. /parrainage : formulaire de retrait + solde.
  //
  // Chantier brique 4/N (restructuration en onglets) : ce formulaire vit
  // dans l'onglet "Portefeuille", pas rendu dans le DOM réel par défaut —
  // ?flouci=success force ce défaut côté serveur (cf. ParrainageTabs/
  // page.tsx), même mécanique qu'un vrai retour de paiement Flouci.
  // ==========================================================================
  console.log('\n=== 1. /parrainage — formulaire de retrait ===')
  const pageRes = await fetch(`${BASE}/parrainage?flouci=success`, { headers: { cookie: clientCookie } })
  const pageBody = (await pageRes.text()).replace(/<!--\s*-->/g, '')
  check('GET /parrainage → 200', pageRes.status === 200, { status: pageRes.status })
  check('formulaire de retrait présent (input withdrawal_amount)', pageBody.includes('id="withdrawal_amount"'), {})
  check('bouton "Demander le retrait" présent', pageBody.includes('Demander le retrait'), {})
  check('solde de 100 affiché', pageBody.includes('100.000') || pageBody.includes('100,000'), {})

  // ==========================================================================
  // 2. Vrai navigateur : remplit le montant, clique, vérifie le résultat.
  // ==========================================================================
  console.log('\n=== 2. Clic réel "Demander le retrait" (navigateur) ===')
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
  // être ouvert AVANT de chercher le formulaire de retrait (onglet
  // "Parrainage" actif par défaut sans ?flouci=...).
  await page.getByRole('button', { name: 'Portefeuille', exact: true }).click()
  await page.getByLabel('Montant à retirer (TND)').fill('35')
  const requestButton = page.getByRole('button', { name: 'Demander le retrait' })
  await requestButton.click()
  // Après succès, le formulaire vide son champ et le solde affiché passe à
  // 65 (100 - 35) — attend explicitement ce nouveau texte plutôt qu'un
  // délai fixe.
  await page.getByText('65.000').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  const newBalanceVisible = await page.getByText('65.000').first().isVisible().catch(() => false)
  check('solde mis à jour à 65.000 après clic réel', newBalanceVisible, {})
  const historyBadgeVisible = await page.getByText('En attente de traitement').first().isVisible().catch(() => false)
  check('badge "En attente de traitement" visible dans l\'historique', historyBadgeVisible, {})
  await browser.close()

  const { data: withdrawalsAfterClick } = await service.from('wallet_withdrawals').select('id, amount, status').eq('profile_id', clientId)
  check('demande de retrait réellement créée en base (35, pending)', withdrawalsAfterClick?.length === 1 && withdrawalsAfterClick[0].amount === 35 && withdrawalsAfterClick[0].status === 'pending', { withdrawalsAfterClick })
  const withdrawalId = withdrawalsAfterClick?.[0]?.id
  if (withdrawalId) cleanup.withdrawals.push(withdrawalId)

  const { data: balanceAfterClick } = await service.from('profiles').select('wallet_balance').eq('id', clientId).single()
  check('solde réellement débité en base (100 -> 65)', balanceAfterClick?.wallet_balance === 65, { balanceAfterClick })

  // ==========================================================================
  // 3. /admin/portefeuille-retraits : demande listée, boutons présents.
  // ==========================================================================
  console.log('\n=== 3. /admin/portefeuille-retraits ===')
  const adminPageRes = await fetch(`${BASE}/admin/portefeuille-retraits`, { headers: { cookie: adminCookie } })
  const adminPageBody = await adminPageRes.text()
  check('GET /admin/portefeuille-retraits (admin) → 200', adminPageRes.status === 200, { status: adminPageRes.status })
  check('demande de retrait (35) listée', adminPageBody.includes('35.000') || adminPageBody.includes('35,000'), {})
  check('boutons "Marquer payé" / "Rejeter" présents', adminPageBody.includes('Marquer payé') && adminPageBody.includes('Rejeter'), {})

  const nonAdminRes = await fetch(`${BASE}/admin/portefeuille-retraits`, { headers: { cookie: clientCookie }, redirect: 'manual' })
  check('non-admin : redirigé hors de /admin/portefeuille-retraits', [301, 302, 303, 307, 308].includes(nonAdminRes.status), { status: nonAdminRes.status })

  // ==========================================================================
  // 4. Traitement admin : paye la demande via la session admin réelle
  //    (même update que payWalletWithdrawal) — solde déjà débité, ne doit
  //    pas changer.
  // ==========================================================================
  console.log('\n=== 4. Paiement admin (via session réelle) ===')
  const { error: payErr } = await admin
    .from('wallet_withdrawals')
    .update({ status: 'paid', processed_by: adminId, processed_at: new Date().toISOString() })
    .eq('id', withdrawalId)
    .eq('status', 'pending')
  check('admin : marquer payé réussit', !payErr, { payErr })
  const { data: balanceAfterPaid } = await service.from('profiles').select('wallet_balance').eq('id', clientId).single()
  check('solde inchangé après paiement (toujours 65)', balanceAfterPaid?.wallet_balance === 65, { balanceAfterPaid })

  // ==========================================================================
  // 5. Lien AdminNav (vérification source, même raisonnement que commit 1).
  // ==========================================================================
  console.log('\n=== 5. AdminNav (vérification source) ===')
  const navSource = readFileSync('components/layout/AdminNav.tsx', 'utf8')
  check('AdminNav.tsx référence le nouveau lien avec le bon label et le bon href', navSource.includes("{ href: '/admin/portefeuille-retraits', label: 'Retraits portefeuille' }"), {})

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.withdrawals) { try { await service.from('wallet_withdrawals').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
