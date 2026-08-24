// Vérification EMPIRIQUE (pas supposée) que createBrowserClient
// (@supabase/ssr) pose des cookies que le middleware/SSR de cette app lit
// correctement — première utilisation de ce pattern dans cette codebase.
//
// Technique : polyfill minimal de document.cookie (sémantique réelle :
// parse "name=value; Path=...; Max-Age=..." à l'écriture, ne renvoie que
// les entrées non expirées à la lecture) pour que isBrowser() de
// @supabase/ssr (typeof window/window.document !== 'undefined') laisse le
// VRAI code de la librairie emprunter son VRAI chemin navigateur
// (documentCookieGetAll/documentCookieSetAll, cf. node_modules/@supabase/
// ssr/dist/module/cookies.js) — pas une réimplémentation, le code réel du
// projet, exécuté avec les mêmes dépendances que le navigateur utiliserait.
//
// Puis : cookies capturés → requête HTTP réelle vers le serveur dev avec
// ces cookies → confirme que middleware.ts/le client serveur reconnaissent
// la session.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-client-login.mjs
import { readFileSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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

// --- Polyfill document.cookie (sémantique réelle d'un jar de cookies) ---
const jar = new Map() // name -> value
function parseSetCookieString(str) {
  const parts = str.split(';').map((p) => p.trim())
  const [name, ...rest] = parts[0].split('=')
  const value = rest.join('=')
  const attrs = Object.fromEntries(
    parts.slice(1).map((p) => {
      const [k, v] = p.split('=')
      return [k.toLowerCase(), v ?? true]
    })
  )
  return { name, value, maxAge: attrs['max-age'] !== undefined ? Number(attrs['max-age']) : null }
}
const documentPolyfill = {
  get cookie() {
    return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  },
  set cookie(str) {
    const { name, value, maxAge } = parseSetCookieString(str)
    if (maxAge === 0) jar.delete(name)
    else jar.set(name, value)
  },
}
globalThis.window = { document: documentPolyfill }
globalThis.document = documentPolyfill

// Import APRÈS avoir posé le polyfill (isBrowser() est évalué à
// l'exécution des appels, pas à l'import, mais autant être explicite sur
// l'ordre).
const { createBrowserClient } = await import('@supabase/ssr')

// --- Compte de test réel ---
const ts = Date.now()
const email = `browser-login-verify-${ts}@example.com`
const password = 'LiveTestPass!23'
const { data: userData, error: createErr } = await service.auth.admin.createUser({ email, password, email_confirm: true })
if (createErr) throw createErr
await service.from('profiles').update({
  full_name: 'Browser Login Test',
  phone: '+21600000000',
  address: '1 rue de test',
  country: 'TN',
}).eq('id', userData.user.id)

try {
  // --- Le VRAI code du navigateur (même appel que lib/supabase/client.ts) ---
  const browserClient = createBrowserClient(SUPABASE_URL, ANON)
  const { data: signInData, error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  check('signInWithPassword() (via createBrowserClient réel) réussit', !signInErr && !!signInData.user, { signInErr })

  const cookiesWritten = Array.from(jar.keys())
  check('des cookies ont bien été écrits par la librairie', cookiesWritten.length > 0, { cookiesWritten })
  check('le nom du cookie suit le schéma sb-<ref>-auth-token', cookiesWritten.some((n) => /^sb-.*-auth-token/.test(n)), {
    cookiesWritten,
  })

  // --- Requête HTTP réelle vers le serveur dev avec CES cookies exacts ---
  const cookieHeader = documentPolyfill.cookie
  const res = await fetch(`${BASE}/profil`, { headers: { cookie: cookieHeader }, redirect: 'manual' })
  check(
    'le serveur dev reconnaît la session (200, PAS de redirection vers /login)',
    res.status === 200,
    { status: res.status, location: res.headers.get('location') }
  )
  if (res.status === 200) {
    const body = await res.text()
    check('la page /profil affiche bien le nom du compte de test connecté', body.includes('Browser Login Test'), {
      hasName: body.includes('Browser Login Test'),
    })
  }
} finally {
  await service.auth.admin.deleteUser(userData.user.id)
}

console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
process.exit(fail > 0 ? 1 : 0)
