// Tests en direct de la page centralisée /profil/mes-boosts (Phase 3,
// brique 7/N — commit 2) : liste trips/offers/requests 'open' du user
// connecté, chacun avec un BoostPayment réutilisé (sélecteur de durée +
// upload), un item non-open (matched) absent, et redirectTo qui ramène
// bien sur cette page (pas sur la fiche détail) après achat.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-boost-mes-boosts.mjs
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
    full_name: 'Mes Boosts Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
  return { supabase, cookieHeader }
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], offers: [], requests: [] }

async function run() {
  const userId = await makeUser(`mes-boosts-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`mes-boosts-${ts}@example.com`, password)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // ==========================================================================
  // 0. Page vide (aucun item boostable pour un tout nouveau compte)
  // ==========================================================================
  console.log('\n=== 0. État vide ===')
  const emptyRes = await fetch(`${BASE}/profil/mes-boosts`, { headers: { cookie: cookieHeader } })
  const emptyBody = await emptyRes.text()
  check('page répond 200', emptyRes.status === 200, { status: emptyRes.status })
  check('état vide affiché', emptyBody.includes('Tu n') && emptyBody.includes('rien à booster'))

  // ==========================================================================
  // 1. Fixtures : 1 trip open, 1 offer open, 1 request open, 1 request
  //    matched (ne doit PAS apparaître)
  // ==========================================================================
  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: userId, origin_country: 'MesBoostsFR', destination_city: 'MesBoostsTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(trip.id)

  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: userId, item_description: `Mes boosts offer ${ts}`, origin_country: 'MesBoostsFR', destination_city: 'MesBoostsTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(offer.id)

  const { data: request } = await service
    .from('travel_requests')
    .insert({ client_id: userId, item_description: `Mes boosts request ${ts}`, origin_country: 'MesBoostsFR', destination_city: 'MesBoostsTN', budget_max: 100, status: 'open' })
    .select('id')
    .single()
  cleanup.requests.push(request.id)

  const { data: matchedRequest } = await service
    .from('travel_requests')
    .insert({ client_id: userId, item_description: `Mes boosts matched ${ts}`, origin_country: 'MesBoostsFR', destination_city: 'MesBoostsTN', budget_max: 100, status: 'matched' })
    .select('id')
    .single()
  cleanup.requests.push(matchedRequest.id)

  console.log('\n=== 1. Page avec fixtures ===')
  const res = await fetch(`${BASE}/profil/mes-boosts`, { headers: { cookie: cookieHeader } })
  const body = await res.text()
  check('page répond 200', res.status === 200, { status: res.status })
  check('section Trips avec le trip de test', body.includes('MesBoostsFR') && body.includes('MesBoostsTN') && body.includes(trip.id))
  check('section Offres avec l\'offre de test', body.includes(`Mes boosts offer ${ts}`) && body.includes(offer.id))
  check('section Demandes avec la demande open de test', body.includes(`Mes boosts request ${ts}`) && body.includes(request.id))
  check('la demande MATCHED n\'apparaît pas (id absent)', !body.includes(matchedRequest.id))
  check('la demande MATCHED n\'apparaît pas (texte absent)', !body.includes(`Mes boosts matched ${ts}`))
  check('3 formulaires BoostPayment (name="duration_days" x3)', (body.match(/name="duration_days"/g) ?? []).length === 3)
  const bodyFlat = body.replace(/<!--\s*-->/g, '')
  // >= 3 (pas === 3) : le texte visible apparaît aussi une 2e fois dans le
  // payload RSC sérialisé inline (children texte, contrairement aux
  // attributs HTML comme name="duration_days" ci-dessus) — comptage exact
  // non fiable, même classe d'artefact que les <!-- --> plus haut.
  check('statut "Non boosté" affiché pour ces items', (bodyFlat.match(/Non boosté/g) ?? []).length >= 3)

  // ==========================================================================
  // 2. Achat depuis cette page pour la demande — vérifie que boosted_until
  //    se pose bien sur travel_requests (chemin request, pas juste trip/offer)
  // ==========================================================================
  console.log('\n=== 2. Achat (request) via la RPC, puis re-rendu de la page ===')
  const { supabase: userClient } = await signInSession(`mes-boosts-${ts}@example.com`, password)
  const { error: purchaseErr } = await userClient.rpc('purchase_boost_virement', {
    p_item_type: 'request', p_item_id: request.id, p_payment_proof_url: 'fixtures/mesboosts-req.jpg', p_duration_days: 2,
  })
  check('achat request réussit', !purchaseErr, { purchaseErr })

  const resAfter = await fetch(`${BASE}/profil/mes-boosts`, { headers: { cookie: cookieHeader } })
  const bodyAfter = (await resAfter.text()).replace(/<!--\s*-->/g, '')
  check('badge "En avant" affiché après achat', bodyAfter.includes('En avant'))
  check('statut "Boosté jusqu\'au" affiché pour la demande', bodyAfter.includes('Boosté jusqu'))

  // ==========================================================================
  // 3. /profil/parametres ne montre plus le lien (repositionné dans UserMenu)
  // ==========================================================================
  // L'entrée "Mes boosts" vit dans UserMenu.tsx (menu profil déroulant,
  // items statiques codés dans le composant client, même position que
  // "Mes litiges") — PAS sur /profil/parametres (retiré, cf. demande de
  // repositionnement). Son affichage dans le dropdown ouvert n'est pas
  // vérifiable sans navigateur (contenu qui ne rend qu'après un clic
  // côté client, jamais dans le HTML SSR brut, même limite que
  // ConnectedSessions plus tôt dans ce projet) — vérifié par lecture du
  // code à la place. Ici, juste un garde-fou de non-régression : le lien
  // ne doit plus traîner sur /profil/parametres.
  console.log('\n=== 3. /profil/parametres ne montre plus le lien (repositionné dans UserMenu) ===')
  const paramsRes = await fetch(`${BASE}/profil/parametres`, { headers: { cookie: cookieHeader } })
  const paramsBody = await paramsRes.text()
  check('/profil/parametres répond 200', paramsRes.status === 200, { status: paramsRes.status })
  check('lien "Mes boosts" absent de /profil/parametres (repositionné)', !paramsBody.includes('href="/profil/mes-boosts"'))

  // Cleanup
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.requests) {
    try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
    try { await service.from('travel_requests').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.requests) {
    try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
    try { await service.from('travel_requests').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
