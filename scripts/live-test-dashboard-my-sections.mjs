// Tests en direct du commit 3 (/jibli/dashboard) — sections "Mes demandes
// en cours" / "Mes articles en vente" / "Mes propositions", réutilisant
// MyRequestsPreview/MyProposalsPreview tels quels + le nouveau
// MyOffersPreview (miroir exact du même pattern).
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-my-sections.mjs
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
    full_name: 'Sections Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const cleanup = { users: [], requests: [], offers: [], proposals: [] }

async function run() {
  const userId = await makeUser(`sections-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`sections-${ts}@example.com`, password)

  console.log('\n=== 0. États vides (compte tout neuf) ===')
  const res0 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body0 = (await res0.text()).replace(/<!--\s*-->/g, '')
  check('page répond 200', res0.status === 200, { status: res0.status })
  check('état vide "Mes demandes en cours"', body0.includes('Tu n') && body0.includes('publié aucune demande'))
  check('état vide "Mes articles en vente" avec CTA /jibli/offres/nouveau', body0.includes('publié aucun article') && body0.includes('/jibli/offres/nouveau'))
  check('état vide "Mes propositions"', body0.includes('fait aucune proposition'))

  console.log('\n=== 1. Fixtures : 1 demande open, 1 demande cancelled (exclue), 1 article, 1 proposition envoyée ===')
  const { data: openReq } = await service.from('travel_requests').insert({ client_id: userId, item_description: `Sec req open ${ts}`, origin_country: 'SecFR', destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(openReq.id)
  const { data: cancelledReq } = await service.from('travel_requests').insert({ client_id: userId, item_description: `Sec req cancelled ${ts}`, origin_country: 'SecFR', destination_city: 'Tunis', budget_max: 100, status: 'cancelled' }).select('id').single()
  cleanup.requests.push(cancelledReq.id)

  const { data: offer } = await service.from('product_offers').insert({ voyageur_id: userId, item_description: `Sec offer ${ts}`, origin_country: 'SecFR', destination_city: 'Tunis', travel_date: travelDate, item_price: 80, delivery_fee: 15, status: 'open' }).select('id').single()
  cleanup.offers.push(offer.id)

  const otherId = await makeUser(`sections-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const { data: otherReq } = await service.from('travel_requests').insert({ client_id: otherId, item_description: `Sec other req ${ts}`, origin_country: 'SecFR', destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(otherReq.id)
  const { data: proposal } = await service.from('travel_proposals').insert({ request_id: otherReq.id, voyageur_id: userId, item_price: 40, delivery_fee: 8 }).select('id').single()
  cleanup.proposals.push(proposal.id)

  const res1 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body1 = (await res1.text()).replace(/<!--\s*-->/g, '')
  check('page répond 200', res1.status === 200, { status: res1.status })

  console.log('\n=== 2. Sections peuplées, items actifs uniquement ===')
  check('"Mes demandes en cours" : la demande OPEN apparaît', body1.includes(`Sec req open ${ts}`))
  check('"Mes demandes en cours" : la demande CANCELLED est exclue (filtre actifs uniquement)', !body1.includes(`Sec req cancelled ${ts}`))
  check('"Mes articles en vente" : l\'article apparaît', body1.includes(`Sec offer ${ts}`))
  check('lien vers la fiche article présent', body1.includes(`/jibli/offres/${offer.id}`))
  check('"Mes propositions" : la proposition envoyée apparaît (via le nom de la demande de l\'autre user)', body1.includes(`Sec other req ${ts}`))
  check('lien "Voir tout" vers /jibli/mes-demandes présent', body1.includes('/jibli/mes-demandes'))
  check('lien "Voir tout" vers /jibli/mes-offres présent', body1.includes('/jibli/mes-offres'))
  check('lien "Voir tout" vers /jibli/mes-propositions présent', body1.includes('/jibli/mes-propositions'))

  // Cleanup
  for (const id of cleanup.proposals) { try { await service.from('travel_proposals').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.proposals) { try { await service.from('travel_proposals').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
