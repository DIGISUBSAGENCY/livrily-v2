// Tests en direct du rebranchement "Appareils connectés"
// (list_my_sessions/revoke_my_session + ConnectedSessions.tsx sur
// /profil/parametres) — même technique de polyfill document.cookie que
// scripts/live-test-client-login.mjs pour emprunter le vrai chemin
// navigateur de createBrowserClient.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-connected-sessions.mjs
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

// --- Polyfill document.cookie, un jar isolé par "appareil" simulé ---
function makeCookieJar() {
  const jar = new Map()
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
  return {
    get cookie() {
      return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
    },
    set cookie(str) {
      const { name, value, maxAge } = parseSetCookieString(str)
      if (maxAge === 0) jar.delete(name)
      else jar.set(name, value)
    },
  }
}

async function signInAsDevice() {
  const documentPolyfill = makeCookieJar()
  globalThis.window = { document: documentPolyfill }
  globalThis.document = documentPolyfill
  const { createBrowserClient } = await import('@supabase/ssr')
  const client = createBrowserClient(SUPABASE_URL, ANON)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn: ${error.message}`)
  const { data: claimsData } = await client.auth.getClaims()
  return { client, cookie: documentPolyfill.cookie, sessionId: claimsData?.claims.session_id }
}

const ts = Date.now()
const email = `connected-sessions-${ts}@example.com`
const password = 'LiveTestPass!23'
let userId

async function run() {
  const { data: userData, error: createErr } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (createErr) throw createErr
  userId = userData.user.id
  await service.from('profiles').update({
    full_name: 'Connected Sessions Test',
    phone: '+21600000000',
    address: '1 rue de test',
    country: 'TN',
  }).eq('id', userId)

  // --- 2 sessions concurrentes du même compte ("2 appareils") ---
  const deviceA = await signInAsDevice()
  const deviceB = await signInAsDevice()
  check("2 sessions distinctes établies", deviceA.sessionId !== deviceB.sessionId, {
    a: deviceA.sessionId,
    b: deviceB.sessionId,
  })

  // --- list_my_sessions() (RPC) voit bien les 2 depuis la session A ---
  const { data: sessionsFromA } = await deviceA.client.rpc('list_my_sessions')
  check('list_my_sessions() renvoie les 2 sessions', (sessionsFromA ?? []).length === 2, { sessionsFromA })

  // --- Rendu réel de /profil/parametres avec les cookies de la session A ---
  // "Appareils connectés" est un CollapsibleSection (defaultOpen=false,
  // comme toutes les autres sections de cette page) : ConnectedSessions ne
  // MONTE (donc ne produit "Cet appareil"/"Déconnecter") qu'après un clic
  // client-side — un fetch brut ne peut jamais voir ce texte, section
  // repliée ou non, ce n'est pas un bug. Ce qui compte réellement est
  // vérifiable : les DONNÉES (ids de session, ip, user_agent) atteignent
  // bien la frontière du Client Component dans le payload RSC sérialisé.
  const res = await fetch(`${BASE}/profil/parametres`, { headers: { cookie: deviceA.cookie }, redirect: 'manual' })
  check('/profil/parametres répond 200', res.status === 200, { status: res.status })
  const body = await res.text()
  check('pas d\'erreur RSC/runtime', !body.includes('cannot be passed directly to Client Components') && !body.includes('Application error'))
  check('"Appareils connectés" affiché (plus "Bientôt disponible")', body.includes('Appareils connectés') && !body.includes('Bientôt disponible'))
  check('id de la session A présent dans le payload (props transmis au Client Component)', body.includes(deviceA.sessionId), {
    sessionId: deviceA.sessionId,
  })
  check('id de la session B présent aussi (les 2 sessions sont bien transmises)', body.includes(deviceB.sessionId), {
    sessionId: deviceB.sessionId,
  })

  // --- Vérifie que ip/user_agent sont bien peuplés en base (pas null) —
  //     cette session a été établie en appelant Supabase directement
  //     (createBrowserClient), sans passer par l'app, donc sans le
  //     placeholder statique que produisait l'ancien flow serveur.
  //     auth.sessions n'est pas exposé via PostgREST (schéma auth) : relu
  //     via list_my_sessions() elle-même, déjà vérifiée ci-dessus. ---
  const sessionARow = (sessionsFromA ?? []).find((s) => s.id === deviceA.sessionId)
  check('user_agent/ip peuplés pour la session A (pas null)', !!sessionARow?.user_agent || !!sessionARow?.ip, {
    sessionARow,
  })

  // --- revokeSession() : révoque B depuis A, confirme qu'il disparaît ---
  const { error: revokeErr } = await deviceA.client.rpc('revoke_my_session', { p_session_id: deviceB.sessionId })
  check('revoke_my_session() (session B, depuis A) ne renvoie pas d\'erreur', !revokeErr, { revokeErr })

  const { data: sessionsAfterRevoke } = await deviceA.client.rpc('list_my_sessions')
  check('B a bien disparu de list_my_sessions() après révocation', (sessionsAfterRevoke ?? []).every((s) => s.id !== deviceB.sessionId), {
    sessionsAfterRevoke,
  })

  // --- La session B elle-même est bien invalidée côté Supabase (pas
  //     seulement retirée de la liste) ---
  const { data: bStillWorks, error: bErr } = await deviceB.client.auth.getUser()
  check('la session B est réellement invalidée (getUser échoue)', !!bErr || !bStillWorks?.user, { bErr, bStillWorks })

  await service.auth.admin.deleteUser(userId)

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  if (userId) await service.auth.admin.deleteUser(userId).catch(() => {})
  process.exit(1)
})
