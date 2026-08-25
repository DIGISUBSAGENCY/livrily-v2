// Test en direct : "Comment ça marche" et "Parrainage" retirés du header
// principal (Header.tsx desktop + MobileNav.tsx mobile), restent
// UNIQUEMENT dans Footer.tsx. Vérifie sur les 3 cas (invité, client,
// admin) que ces 2 liens n'apparaissent plus dans le header, que Footer.tsx
// les garde bien, et que les liens conservés (Demandes/Trips/Offres/
// Dashboard) fonctionnent toujours comme avant.
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
    full_name: 'Header Trim Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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

// Isole la zone <header>...</header> pour ne pas confondre un lien du
// header avec le même lien légitimement présent dans <footer> plus bas
// dans le même document.
function headerHtml(fullHtml) {
  const start = fullHtml.indexOf('<header')
  const end = fullHtml.indexOf('</header>')
  return start !== -1 && end !== -1 ? fullHtml.slice(start, end) : ''
}
function footerHtml(fullHtml) {
  const start = fullHtml.indexOf('<footer')
  const end = fullHtml.indexOf('</footer>')
  return start !== -1 && end !== -1 ? fullHtml.slice(start, end) : ''
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [] }

async function run() {
  const clientId = await makeUser(`header-trim-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const clientCookie = await signInSession(`header-trim-client-${ts}@example.com`, password)

  const adminId = await makeUser(`header-trim-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const adminCookie = await signInSession(`header-trim-admin-${ts}@example.com`, password)

  const cases = [
    { label: 'invité', cookie: '' },
    { label: 'client', cookie: clientCookie },
    { label: 'admin', cookie: adminCookie },
  ]

  for (const c of cases) {
    console.log(`\n=== ${c.label} ===`)
    const res = await fetch(`${BASE}/`, { headers: c.cookie ? { cookie: c.cookie } : {} })
    const body = await res.text()
    const header = headerHtml(body)
    const footer = footerHtml(body)

    check(`header : "Comment ça marche" absent (${c.label})`, !header.includes('Comment ça marche'), {})
    check(`header : href="/comment-ca-marche" absent (${c.label})`, !header.includes('href="/comment-ca-marche"'), {})
    check(`header : "Parrainage" absent (${c.label})`, !header.includes('>Parrainage<'), {})
    check(`header : href="/parrainage" absent (${c.label})`, !header.includes('href="/parrainage"'), {})

    check(`footer : "Comment ça marche" toujours présent (${c.label})`, footer.includes('Comment ça marche'), {})
    check(`footer : href="/comment-ca-marche" toujours présent (${c.label})`, footer.includes('href="/comment-ca-marche"'), {})
    check(`footer : "Parrainage" toujours présent (${c.label})`, footer.includes('>Parrainage<'), {})
    check(`footer : href="/parrainage" toujours présent (${c.label})`, footer.includes('href="/parrainage"'), {})
  }

  // Liens conservés : toujours fonctionnels pour un client.
  console.log('\n=== Liens conservés (client) ===')
  const clientRes = await fetch(`${BASE}/`, { headers: { cookie: clientCookie } })
  const clientHeader = headerHtml(await clientRes.text())
  check('header : "Demandes" toujours présent', clientHeader.includes('>Demandes<'), {})
  check('header : "Trips" toujours présent', clientHeader.includes('>Trips<'), {})
  check('header : "Offres" toujours présent', clientHeader.includes('>Offres<'), {})
  check('header : "Dashboard" toujours présent', clientHeader.includes('>Dashboard<'), {})

  // MobileNav (vérification source, dropdown ouvert par JS — jamais dans
  // le HTML initial, même limite documentée sur les autres menus de ce
  // projet) : la prop showParrainage a bien disparu, et les liens
  // Comment-ça-marche/Parrainage ne sont plus référencés du tout.
  console.log('\n=== MobileNav (vérification source) ===')
  const mobileNavSource = readFileSync('components/layout/MobileNav.tsx', 'utf8')
  check('MobileNav.tsx n\'a plus la prop showParrainage', !mobileNavSource.includes('showParrainage'), {})
  check('MobileNav.tsx ne référence plus /comment-ca-marche', !mobileNavSource.includes('/comment-ca-marche'), {})
  check('MobileNav.tsx ne référence plus /parrainage', !mobileNavSource.includes('/parrainage'), {})
  check('MobileNav.tsx garde le lien Dashboard (showDashboard)', mobileNavSource.includes('showDashboard'), {})

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
