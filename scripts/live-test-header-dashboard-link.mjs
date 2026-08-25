// Test en direct : lien "Dashboard" dans Header.tsx/MobileNav.tsx, ajouté
// pour rendre accessible /jibli/dashboard (mergé sans jamais avoir de point
// d'entrée). Vérifie la condition de visibilité (role === 'client') sur les
// 3 cas : invité, client, admin — et que le lien pointe bien vers la bonne
// route, sur desktop ET mobile.
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

async function makeUser(email, password, extra) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: 'Header Dashboard Link Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
  return Array.from(jar.entries()).map(([n, v]) => `${n}=${v}`).join('; ')
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [] }

async function run() {
  // 1) Invité (pas de cookie) : lien absent.
  console.log('\n=== 1. Invité ===')
  const guestRes = await fetch(`${BASE}/`)
  const guestBody = await guestRes.text()
  check('lien href="/jibli/dashboard" absent pour un invité', !guestBody.includes('href="/jibli/dashboard"'), {})

  // 2) Client connecté : lien présent, pointe vers /jibli/dashboard.
  console.log('\n=== 2. Client connecté ===')
  const clientId = await makeUser(`header-dash-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const clientCookie = await signInSession(`header-dash-client-${ts}@example.com`, password)
  const clientRes = await fetch(`${BASE}/`, { headers: { cookie: clientCookie } })
  const clientBody = await clientRes.text()
  check('lien href="/jibli/dashboard" présent pour un client', clientBody.includes('href="/jibli/dashboard"'), {})
  check('libellé "Dashboard" présent', clientBody.includes('>Dashboard<'), {})

  // Vérifie que la cible répond bien (200, pas de redirection surprise)
  // pour ce même compte connecté.
  const targetRes = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: clientCookie } })
  check('GET /jibli/dashboard (client connecté) → 200', targetRes.status === 200, { status: targetRes.status })

  // 3) Admin connecté : lien absent (même raisonnement que Parrainage).
  console.log('\n=== 3. Admin connecté ===')
  const adminId = await makeUser(`header-dash-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const adminCookie = await signInSession(`header-dash-admin-${ts}@example.com`, password)
  const adminRes = await fetch(`${BASE}/`, { headers: { cookie: adminCookie } })
  const adminBody = await adminRes.text()
  check('lien href="/jibli/dashboard" absent pour un admin', !adminBody.includes('href="/jibli/dashboard"'), {})

  // 4) Source MobileNav.tsx : le lien mobile existe bien, gaté sur
  //    showDashboard (dropdown fermé par défaut, jamais dans le HTML rendu
  //    initial — même limite déjà documentée sur AdminNav ce chantier-ci,
  //    vérifié au niveau du fichier source plutôt qu'un GET HTML).
  console.log('\n=== 4. MobileNav (vérification source) ===')
  const mobileNavSource = readFileSync('components/layout/MobileNav.tsx', 'utf8')
  check('MobileNav.tsx a la prop showDashboard', mobileNavSource.includes('showDashboard: boolean'), {})
  check('MobileNav.tsx a le lien vers /jibli/dashboard gaté sur showDashboard', /showDashboard && \(\s*<Link\s*\n\s*href="\/jibli\/dashboard"/.test(mobileNavSource), {})

  const headerSource = readFileSync('components/layout/Header.tsx', 'utf8')
  check('Header.tsx passe showDashboard={role === \'client\'} à MobileNav', headerSource.includes("showDashboard={role === 'client'}"), {})

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
