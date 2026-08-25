// Tests en direct du commit 2 (/jibli/dashboard) — section "Activité en
// direct" (2 onglets Articles/Demandes, agrégation JS par pays, carte
// Google Maps + liste de repli). Le flux est PLATEFORME-LARGE (pas scopé à
// l'utilisateur) — les fixtures utilisent un origin_country unique à ce
// run pour rester repérables au milieu des données réelles déjà en base.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-country-flow.mjs
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
    full_name: 'Country Flow Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
// "France" (reconnu, coordonnées) pour les offres — 3 lignes, casse
// volontairement mélangée pour vérifier la normalisation (France/france).
// Un pays FICTIF unique à ce run (non reconnu, doit tomber dans le repli
// texte) pour les demandes.
const KNOWN_ORIGIN_VARIANTS = ['France', 'france', 'FRANCE']
const UNKNOWN_ORIGIN = `Pays-Fictif-${ts}`
const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
const cleanup = { users: [], offers: [], requests: [] }

// Extrait le count affiché sur la pill "France → Tunisie" (structure
// exacte du markup de CountryFlowSection.tsx, mise à jour après le passage
// liste-à-barres → pills, cf. chantier Leaflet). "France" a déjà de vraies
// données en prod (vu en explorant) — on compare un AVANT/APRÈS plutôt
// qu'une valeur absolue, jamais fiable ici.
function franceCount(body) {
  // <!-- --> : React (SSR streaming) insère ce commentaire entre deux
  // expressions JSX voisines ("France" et " → Tunisie" sont deux enfants
  // séparés, cf. CountryFlowSection.tsx : {row.label} → Tunisie) — retiré
  // avant de chercher la sous-chaîne, sinon faux mismatch sur un rendu
  // pourtant correct (même artefact que rencontré ailleurs dans ce projet).
  const flat = body.replace(/<!--\s*-->/g, '')
  const match = flat.match(/France → Tunisie[\s\S]{0,150}?font-semibold text-white">\s*(\d+)\s*<\/span>/)
  return match ? Number(match[1]) : null
}

async function run() {
  const userId = await makeUser(`countryflow-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`countryflow-${ts}@example.com`, password)

  const beforeRes = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const franceCountBefore = franceCount(await beforeRes.text()) ?? 0

  // 3 offres open, origin_country = variantes de casse de "France" —
  // doivent se regrouper en UNE seule ligne (count=3), pas 3 lignes
  // distinctes à cause de la casse.
  for (const origin of KNOWN_ORIGIN_VARIANTS) {
    const { data: offer } = await service
      .from('product_offers')
      .insert({ voyageur_id: userId, item_description: `CF offer ${origin} ${ts}`, origin_country: origin, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' })
      .select('id')
      .single()
    cleanup.offers.push(offer.id)
  }

  // 1 offre non-open (cancelled) sur le même pays fictif que les demandes —
  // ne doit PAS compter (filtre status='open').
  const { data: cancelledOffer } = await service
    .from('product_offers')
    .insert({ voyageur_id: userId, item_description: `CF cancelled ${ts}`, origin_country: UNKNOWN_ORIGIN, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'cancelled' })
    .select('id')
    .single()
  cleanup.offers.push(cancelledOffer.id)

  // 2 demandes open sur un pays fictif non reconnu (repli texte attendu).
  for (let i = 0; i < 2; i++) {
    const { data: request } = await service
      .from('travel_requests')
      .insert({ client_id: userId, item_description: `CF request ${i} ${ts}`, origin_country: UNKNOWN_ORIGIN, destination_city: 'Tunis', budget_max: 100, status: 'open' })
      .select('id')
      .single()
    cleanup.requests.push(request.id)
  }

  console.log('\n=== 1. Onglets présents, France groupée malgré la casse (Articles) ===')
  const res = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body = await res.text()
  check('page répond 200', res.status === 200, { status: res.status })
  check('onglet "Articles" présent', body.includes('Articles'))
  check('onglet "Demandes" présent', body.includes('Demandes'))

  // France (groupée) : le total affiché doit avoir augmenté d'EXACTEMENT 3
  // (les 3 variantes de casse ajoutées) — pas une valeur absolue, "France"
  // a déjà de vraies données en prod (baseline non nulle, vu en explorant).
  const franceCountAfter = franceCount(body)
  check('count "France" a augmenté de +3 (3 casses regroupées en 1 ligne, pas 3 lignes)', franceCountAfter === franceCountBefore + 3, {
    franceCountBefore, franceCountAfter,
  })

  console.log('\n=== 2. Repli texte pour un pays non reconnu (present dans le payload, même onglet non actif) ===')
  // Le pays fictif est sur l'onglet DEMANDES (pas actif par défaut) — les
  // deux jeux de données sont passés en props à CountryFlowSection (client
  // component), donc présents dans le payload RSC sérialisé même si
  // l'onglet Articles est affiché par défaut (même technique que la
  // vérification ConnectedSessions plus tôt dans ce projet : la DONNÉE
  // atteint la frontière client, indépendamment de ce qui est visible).
  // Recherche par SOUS-CHAÎNE littérale (pas regex) : le payload RSC
  // échappe les guillemets ("label":"X" devient \"label\":\"X\" dans le
  // HTML brut) — trouvé en inspectant la réponse réelle, pas supposé.
  check(`le pays fictif "${UNKNOWN_ORIGIN}" apparaît dans le payload (repli texte, pas perdu)`, body.includes(UNKNOWN_ORIGIN))
  const expectedCountSnippet = `${UNKNOWN_ORIGIN}\\",\\"count\\":2`
  check('count=2 pour le pays fictif (offre cancelled exclue, seules les 2 demandes open comptent)', body.includes(expectedCountSnippet), {
    expectedCountSnippet,
  })

  // Section 3 (vérif du conteneur carte) retirée d'ici : la carte est
  // passée de Google Maps à Leaflet (chantier design/leaflet-country-flow-
  // map) — couverte désormais par scripts/live-test-dashboard-leaflet-map.mjs,
  // pas dupliquée ici. Ce script-ci reste focalisé sur l'agrégation par
  // pays (JS, cf. lib/countryGeo.ts), inchangée par ce chantier.

  // Cleanup
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.requests) { try { await service.from('travel_requests').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
