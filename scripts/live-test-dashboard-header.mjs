// Tests en direct du commit 1 (/jibli/dashboard) — en-tête personnalisé,
// 3 compteurs réels, bandeau IdentityBanner, boutons d'accès rapide.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-header.mjs
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

async function makeUser(email, password, fullName) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: fullName, phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const cleanup = { users: [], requests: [], offers: [], proposals: [] }

async function run() {
  const userId = await makeUser(`dashboard-${ts}@example.com`, password, 'Amira Ben Salah')
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`dashboard-${ts}@example.com`, password)

  console.log('\n=== 0. Aucune donnée : compteurs à 0, prénom correct, bandeau KYC affiché ===')
  const res0 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body0 = (await res0.text()).replace(/<!--\s*-->/g, '')
  check('page répond 200', res0.status === 200, { status: res0.status })
  check('prénom extrait correctement ("Bonjour Amira")', body0.includes('Bonjour Amira'))
  check('bandeau "Compte à compléter" affiché (identité non vérifiée)', body0.includes('Compte à compléter'))
  check('CTA vérification identité présent', body0.includes('/profil/verification-identite'))
  check('3 boutons de raccourci présents', body0.includes('/jibli/nouvelle-demande') && body0.includes('/jibli/offres/nouveau') && body0.includes('/jibli/mes-demandes') && body0.includes('/jibli/mes-offres'))

  const idxDemandes = body0.indexOf('Mes demandes')
  const idxArticles = body0.indexOf('Mes articles')
  const idxProps = body0.indexOf('Propositions')
  check('les 3 labels de compteurs sont présents', idxDemandes !== -1 && idxArticles !== -1 && idxProps !== -1, {
    idxDemandes, idxArticles, idxProps,
  })

  console.log('\n=== 1. Fixtures : 2 demandes, 1 offre, 1 proposition envoyée, 1 reçue ===')
  const { data: req1 } = await service.from('travel_requests').insert({ client_id: userId, item_description: `Dash req1 ${ts}`, origin_country: 'DashFR', destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(req1.id)
  const { data: req2 } = await service.from('travel_requests').insert({ client_id: userId, item_description: `Dash req2 ${ts}`, origin_country: 'DashFR', destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(req2.id)

  const { data: offer } = await service.from('product_offers').insert({ voyageur_id: userId, item_description: `Dash offer ${ts}`, origin_country: 'DashFR', destination_city: 'Tunis', travel_date: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10), item_price: 100, delivery_fee: 20, status: 'open' }).select('id').single()
  cleanup.offers.push(offer.id)

  // Un autre compte publie une demande sur laquelle NOTRE user propose (proposition envoyée).
  const otherId = await makeUser(`dashboard-other-${ts}@example.com`, password, 'Autre User')
  cleanup.users.push(otherId)
  const { data: otherReq } = await service.from('travel_requests').insert({ client_id: otherId, item_description: `Dash other req ${ts}`, origin_country: 'DashFR', destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(otherReq.id)
  const { data: sentProposal } = await service.from('travel_proposals').insert({ request_id: otherReq.id, voyageur_id: userId, item_price: 50, delivery_fee: 10 }).select('id').single()
  cleanup.proposals.push(sentProposal.id)

  // Une proposition REÇUE sur une des demandes de notre user (par un tiers).
  const voyageurId = await makeUser(`dashboard-voy-${ts}@example.com`, password, 'Voyageur Test')
  cleanup.users.push(voyageurId)
  const { data: receivedProposal } = await service.from('travel_proposals').insert({ request_id: req1.id, voyageur_id: voyageurId, item_price: 30, delivery_fee: 5 }).select('id').single()
  cleanup.proposals.push(receivedProposal.id)

  const res1 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body1 = (await res1.text()).replace(/<!--\s*-->/g, '')
  check('page répond 200', res1.status === 200, { status: res1.status })

  // Structure exacte de DashboardStatCard.tsx : <p class="text-2xl font-bold
  // tracking-tight text-slate-900">{value}</p><p class="text-sm
  // text-slate-500">{label}</p> — regex ciblée sur ces classes précises,
  // pas un chiffre au hasard sur la page.
  function statValueForLabel(body, label) {
    const re = new RegExp(
      `text-2xl font-bold tracking-tight text-slate-900">(\\d+)</p><p class="text-sm text-slate-500">${label}`
    )
    const match = body.match(re)
    return match ? Number(match[1]) : null
  }

  const demandesValue = statValueForLabel(body1, 'Mes demandes')
  const articlesValue = statValueForLabel(body1, 'Mes articles')
  const propsValue = statValueForLabel(body1, 'Propositions')

  check('compteur "Mes demandes" = 2', demandesValue === 2, { demandesValue })
  check('compteur "Mes articles" = 1', articlesValue === 1, { articlesValue })
  check('compteur "Propositions" = 2 (1 envoyée + 1 reçue)', propsValue === 2, { propsValue })

  console.log('\n=== 2. Après vérification approuvée : bandeau disparaît ===')
  await service.from('identity_verifications').insert({
    profile_id: userId, id_document_url: 'fixtures/id.jpg', selfie_url: 'fixtures/selfie.jpg', status: 'approved',
  })
  const res2 = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body2 = await res2.text()
  check('bandeau "Compte à compléter" disparaît une fois approuvé', !body2.includes('Compte à compléter'))

  // Cleanup
  for (const id of cleanup.proposals) { try { await service.from('travel_proposals').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  try { await service.from('identity_verifications').delete().eq('profile_id', userId) } catch {}
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
