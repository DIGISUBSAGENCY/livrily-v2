// Test en direct du commit 4 (portefeuille — restructuration /parrainage en
// onglets "Parrainage"/"Portefeuille"). Vérifie : l'onglet "Parrainage" est
// actif par défaut (le contenu Portefeuille n'est pas dans le DOM réel),
// ?flouci=... bascule le défaut sur "Portefeuille" côté serveur, un vrai
// clic navigateur fait bien basculer l'affichage sans rechargement de page,
// et le contenu Parrainage réapparaît en revenant sur cet onglet.
//
// Piège documenté (trouvé en écrivant ce test) : le payload RSC (flight
// data) inliné dans le HTML initial contient le texte des DEUX onglets
// (nécessaire pour changer d'onglet sans round-trip serveur) — une
// recherche de texte brut ("Déposer", un RIB...) matche donc à tort même
// onglet fermé. Seule la syntaxe d'attribut HTML réelle (name="...") est
// fiable pour un GET nu ; d'où les assertions ci-dessous portent sur des
// attributs, jamais du texte seul, pour les checks HTTP.
import { readFileSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
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

async function makeUser(email, password) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: 'Parrainage Tabs Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
  return cookieHeader()
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [] }

async function run() {
  const clientId = await makeUser(`parrainage-tabs-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const clientCookie = await signInSession(`parrainage-tabs-${ts}@example.com`, password)

  // ==========================================================================
  // 1. GET nu (pas de ?flouci=...) : onglet "Parrainage" actif par défaut —
  //    le contenu Portefeuille (attributs HTML réels, pas juste du texte)
  //    est absent du DOM rendu.
  // ==========================================================================
  console.log('\n=== 1. Défaut = onglet Parrainage ===')
  const defaultRes = await fetch(`${BASE}/parrainage`, { headers: { cookie: clientCookie } })
  const defaultBody = await defaultRes.text()
  check('GET /parrainage → 200', defaultRes.status === 200, { status: defaultRes.status })
  check('les 2 boutons d\'onglet sont présents', defaultBody.includes('>Parrainage<') && defaultBody.includes('>Portefeuille<'), {})
  check('formulaire de dépôt (Portefeuille) absent du DOM par défaut', !defaultBody.includes('name="amount"'), {})
  check('formulaire de retrait (Portefeuille) absent du DOM par défaut', !defaultBody.includes('id="withdrawal_amount"'), {})

  // ==========================================================================
  // 2. ?flouci=success : bascule le défaut sur "Portefeuille" côté serveur.
  // ==========================================================================
  console.log('\n=== 2. ?flouci=success bascule le défaut sur Portefeuille ===')
  const flouciRes = await fetch(`${BASE}/parrainage?flouci=success`, { headers: { cookie: clientCookie } })
  const flouciBody = await flouciRes.text()
  check('formulaire de dépôt présent avec ?flouci=success', flouciBody.includes('name="amount"'), {})
  check('bannière "Paiement Flouci confirmé" affichée', flouciBody.includes('Paiement Flouci confirmé'), {})

  // ==========================================================================
  // 3. Vrai navigateur : clic réel sur l'onglet Portefeuille, puis retour
  //    sur Parrainage — vérifie la bascule sans rechargement de page.
  // ==========================================================================
  console.log('\n=== 3. Bascule réelle (navigateur), sans rechargement de page ===')
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
  const urlBefore = page.url()

  const depositFormBefore = await page.locator('input#amount').isVisible().catch(() => false)
  check('formulaire de dépôt invisible avant clic (onglet Parrainage actif)', !depositFormBefore, {})

  await page.getByRole('button', { name: 'Portefeuille', exact: true }).click()
  const depositFormAfter = await page.locator('input#amount').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
  check('formulaire de dépôt visible après clic sur "Portefeuille"', depositFormAfter, {})
  check('pas de rechargement de page (URL inchangée)', page.url() === urlBefore, { before: urlBefore, after: page.url() })

  await page.getByRole('button', { name: 'Parrainage', exact: true }).click()
  const depositFormHiddenAgain = await page.locator('input#amount').isHidden().catch(() => false)
  check('formulaire de dépôt de nouveau invisible en revenant sur "Parrainage"', depositFormHiddenAgain, {})

  await browser.close()

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
