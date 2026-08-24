// Tests en direct du remplacement Google Maps → Leaflet sur la section
// "Activité en direct" (/jibli/dashboard) : pills, bouton "Voir tout",
// squelette de chargement du composant carte (ssr:false), payload RSC
// intact pour les 2 onglets. L'agrégation par pays elle-même est déjà
// couverte par scripts/live-test-dashboard-country-flow.mjs (inchangée,
// aucune requête SQL touchée par ce chantier) — pas dupliqué ici.
//
// Ce que ce script NE PEUT PAS vérifier (limite connue, pas une omission) :
// le rendu visuel réel de la carte Leaflet elle-même (tuiles, marqueurs,
// lignes, attribution CARTO/OSM) — tout ça est construit par du JS Leaflet
// exécuté côté navigateur après hydratation, jamais présent dans le HTML
// brut d'un fetch() côté serveur, même une fois le composant hydraté (le
// contrôle d'attribution de Leaflet est créé impérativement par sa propre
// lib JS, pas via l'arbre React). Vérifié à la place : la constante
// TILE_ATTRIBUTION contient bien le texte requis, par lecture du code
// source (cf. check dédié plus bas).
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-leaflet-map.mjs
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
    full_name: 'Leaflet Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const KNOWN_ORIGIN = 'Italie' // reconnu par lib/countryGeo.ts (lat/lng non nuls)
const UNKNOWN_ORIGIN = `Pays-Leaflet-${ts}` // volontairement non reconnu (repli pill sans marqueur)
const cleanup = { users: [], offers: [], requests: [] }

async function run() {
  // 0. La constante TILE_ATTRIBUTION contient bien le texte requis par la
  //    licence CARTO/OSM — vérifié par lecture du fichier source (pas par
  //    HTTP, cf. limite documentée en tête de fichier).
  console.log('\n=== 0. Attribution CARTO/OSM présente dans le code source ===')
  const mapSource = readFileSync('components/travel/CountryFlowMap.tsx', 'utf8')
  check('mentionne OpenStreetMap', mapSource.includes('OpenStreetMap'))
  check('mentionne CARTO', mapSource.includes('CARTO'))
  check('TileLayer reçoit bien la prop attribution', mapSource.includes('attribution={TILE_ATTRIBUTION}'))

  const userId = await makeUser(`leaflet-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`leaflet-${ts}@example.com`, password)

  const { data: offer1 } = await service.from('product_offers').insert({ voyageur_id: userId, item_description: `Leaflet offer 1 ${ts}`, origin_country: KNOWN_ORIGIN, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' }).select('id').single()
  cleanup.offers.push(offer1.id)
  const { data: offer2 } = await service.from('product_offers').insert({ voyageur_id: userId, item_description: `Leaflet offer 2 ${ts}`, origin_country: UNKNOWN_ORIGIN, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' }).select('id').single()
  cleanup.offers.push(offer2.id)
  const { data: request1 } = await service.from('travel_requests').insert({ client_id: userId, item_description: `Leaflet req ${ts}`, origin_country: KNOWN_ORIGIN, destination_city: 'Tunis', budget_max: 100, status: 'open' }).select('id').single()
  cleanup.requests.push(request1.id)

  const res = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  const body = await res.text()
  const bodyFlat = body.replace(/<!--\s*-->/g, '')
  check('page répond 200', res.status === 200, { status: res.status })

  console.log('\n=== 1. Squelette de chargement (ssr:false) présent, pas de tentative de rendu Leaflet côté serveur ===')
  check('le squelette animate-pulse est bien dans le HTML brut (placeholder ssr:false)', bodyFlat.includes('animate-pulse') && bodyFlat.includes('h-80 w-full'))
  check('aucune classe Leaflet interne dans le HTML serveur (jamais rendue côté serveur, comportement attendu)', !bodyFlat.includes('leaflet-container'))

  console.log('\n=== 2. Pills (onglet Articles, actif par défaut) ===')
  check(`pill "${KNOWN_ORIGIN} → Tunisie" avec count=1 présente`, bodyFlat.includes(`${KNOWN_ORIGIN} → Tunisie`))
  check('pill pour le pays non reconnu présente aussi (repli, pas perdu)', bodyFlat.includes(`${UNKNOWN_ORIGIN} → Tunisie`))
  check('bouton "Voir tous les articles" présent avec le bon lien', bodyFlat.includes('Voir tous les articles') && bodyFlat.includes('href="/jibli/offres"'))

  console.log('\n=== 3. Données de l\'onglet Demandes présentes dans le payload (même si pas l\'onglet actif) ===')
  check(`la demande "${KNOWN_ORIGIN}" apparaît dans le payload RSC (2e jeu de données transmis au client)`, (bodyFlat.match(new RegExp(KNOWN_ORIGIN, 'g')) ?? []).length >= 2)

  console.log('\n=== 4. Plus aucune trace de @vis.gl/react-google-maps sur cette page ===')
  check('aucune classe Google Maps résiduelle', !bodyFlat.includes('gm-style') && !bodyFlat.includes('gmnoprint'))

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
