// Test en direct du point 4 (chantier améliorations carte) : l'attribution
// CartoDB/OpenStreetMap doit rester présente (obligation de licence,
// jamais retirée) mais visuellement plus discrète — vérifié dans la CSS
// RÉELLEMENT SERVIE par la page (pas juste dans le code source), pour
// prouver qu'elle atteint bien le navigateur.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-attribution-style.mjs
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
    full_name: 'Attribution Style Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [] }

async function run() {
  const userId = await makeUser(`attribution-style-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`attribution-style-${ts}@example.com`, password)

  const res = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body = await res.text()
  check('page répond 200', res.status === 200, { status: res.status })

  console.log('\n=== Attribution CartoDB/OSM — présente, discrète, dans la CSS réellement servie ===')
  const cssLinks = [...body.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1])
  check('au moins une feuille de style trouvée dans la page', cssLinks.length > 0, { cssLinks })

  let attributionRuleFound = false
  let ruleSnippet = null
  for (const href of cssLinks) {
    const cssRes = await fetch(new URL(href, BASE))
    if (!cssRes.ok) continue
    const css = await cssRes.text()
    // La CSS servie est minifiée (pas de commentaires source) — mais on
    // cherche quand même la classe suivie de `{` pour cibler la vraie
    // déclaration, pas une occurrence fortuite ailleurs dans le fichier.
    const match = css.match(/\.leaflet-control-attribution\s*\{[^}]*\}/)
    if (match) {
      attributionRuleFound = true
      ruleSnippet = match[0]
      break
    }
  }
  check('règle .leaflet-control-attribution présente dans la CSS servie (jamais retirée)', attributionRuleFound, { ruleSnippet })
  if (ruleSnippet) {
    check('opacité réduite au repos (0.55)', ruleSnippet.includes('opacity:.55') || ruleSnippet.includes('opacity: 0.55'), { ruleSnippet })
    check('jamais display:none ni visibility:hidden (licence : doit rester visible/cliquable)', !ruleSnippet.includes('display:none') && !ruleSnippet.includes('visibility:hidden'), { ruleSnippet })
  }

  // Cleanup
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
