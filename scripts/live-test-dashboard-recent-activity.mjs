// Tests en direct du commit 4 (/jibli/dashboard) — "Activité récente",
// réutilise getRecentNotifications() (déjà en prod) + hrefFor() exportée
// de NotificationBell.tsx (pas dupliquée).
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-recent-activity.mjs
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
    full_name: 'Activity Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const cleanup = { users: [], requests: [], notifications: [] }

async function run() {
  const userId = await makeUser(`recent-activity-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`recent-activity-${ts}@example.com`, password)

  console.log('\n=== 0. État vide (aucune notification) ===')
  const res0 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body0 = await res0.text()
  check('page répond 200', res0.status === 200, { status: res0.status })
  check('"Activité récente" affichée avec état vide', body0.includes('Activité récente') && body0.includes('Aucune notification'))

  console.log('\n=== 1. Fixtures : 2 notifications, une liée à une demande (lien cliquable) ===')
  const { data: req } = await service.from('travel_requests').insert({ client_id: userId, item_description: `RA req ${ts}`, origin_country: 'RAFR', destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(req.id)

  const { data: notif1 } = await service.from('notifications').insert({
    user_id: userId, type: 'request_update', priority: 'normal',
    title: `RA notif liée ${ts}`, body: 'Corps de la notif liée', related_object_type: 'travel_request', related_object_id: req.id,
  }).select('id').single()
  cleanup.notifications.push(notif1.id)

  const { data: notif2 } = await service.from('notifications').insert({
    user_id: userId, type: 'verification_update', priority: 'normal',
    title: `RA notif non-lue ${ts}`, body: null,
  }).select('id').single()
  cleanup.notifications.push(notif2.id)

  const res1 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body1 = await res1.text()
  check('page répond 200', res1.status === 200, { status: res1.status })
  check('titre de la 1ère notification affiché', body1.includes(`RA notif liée ${ts}`))
  check('corps de la 1ère notification affiché', body1.includes('Corps de la notif liée'))
  check('titre de la 2e notification affichée', body1.includes(`RA notif non-lue ${ts}`))
  check('lien vers la demande liée présent (hrefFor réutilisée)', body1.includes(`/jibli/${req.id}`))

  // Cleanup
  for (const id of cleanup.notifications) { try { await service.from('notifications').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.notifications) { try { await service.from('notifications').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
