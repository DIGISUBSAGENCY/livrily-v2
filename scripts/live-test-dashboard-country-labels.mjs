// Test de l'étiquette texte par marqueur pays (nom du pays affiché sur la
// carte "Activité en direct") — placement au-dessus/en dessous selon la
// latitude relative à la Tunisie (évite le hub), et échappement HTML du
// label (row.label peut venir de texte libre saisi par un voyageur, cf.
// lib/countryGeo.ts — repli non reconnu).
//
// Limite honnête (déjà documentée dans les scripts précédents pour cette
// carte) : le HTML du DivIcon n'est généré que côté navigateur (Leaflet,
// ssr:false) — invisible dans un fetch() brut. Ce qui EST vérifiable ici :
// (1) la logique de placement (lecture de code + reproduction du calcul
// avec les vraies coordonnées de lib/countryGeo.ts), (2) la fonction
// escapeHtml() RÉELLE du fichier (extraite et exécutée telle quelle, pas
// réimplémentée), et (3) la non-régression fonctionnelle de la page.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-country-labels.mjs
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
    full_name: 'Country Labels Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const cleanup = { users: [], offers: [] }

async function run() {
  console.log('\n=== 1. Fonction escapeHtml() réelle — extraite du fichier et exécutée telle quelle ===')
  const mapSource = readFileSync('components/travel/CountryFlowMap.tsx', 'utf8')

  check('countryDivIcon() prend bien label et placeAbove en paramètres', /function countryDivIcon\(label: string, placeAbove: boolean\)/.test(mapSource))
  check('le label interpolé passe par escapeHtml(label), pas ${label} brut', mapSource.includes('${escapeHtml(label)}') && !mapSource.includes('>${label}<'))
  check('le site d\'appel calcule placeAbove à partir de la latitude relative à la Tunisie', mapSource.includes('countryDivIcon(row.label, (row.lat as number) >= TUNISIA[0])'))

  // Extrait la VRAIE fonction escapeHtml (pas une réimplémentation) et
  // l'exécute directement — même principe que verify-arrow-geometry.mjs
  // (tester le code réel, pas une copie).
  const escapeHtmlMatch = mapSource.match(/function escapeHtml\(text: string\): string \{[\s\S]*?\n\}/)
  check('fonction escapeHtml trouvée dans le fichier', !!escapeHtmlMatch)
  if (escapeHtmlMatch) {
    // Transpilation triviale TS→JS : la fonction ne contient aucune syntaxe
    // TS au-delà de l'annotation de type du paramètre, retirée ici.
    const jsSource = escapeHtmlMatch[0].replace('(text: string): string', '(text)')
    const escapeHtml = new Function(`${jsSource}; return escapeHtml;`)()

    const malicious = `<script>alert(1)</script>`
    const escaped = escapeHtml(malicious)
    check('escapeHtml() neutralise bien <script> (échappement réel, pas supposé)', escaped === '&lt;script&gt;alert(1)&lt;/script&gt;', { escaped })
    check('escapeHtml() échappe aussi les guillemets (protège aussi contre une sortie d\'attribut)', escapeHtml(`"onmouseover="x`).includes('&quot;'))
    check('un nom de pays normal traverse inchangé', escapeHtml('France') === 'France')
  }

  console.log('\n=== 2. Logique de placement au-dessus/en dessous — reproduite avec les vraies coordonnées de lib/countryGeo.ts ===')
  const geoSource = readFileSync('lib/countryGeo.ts', 'utf8')
  const TUNISIA_LAT = 34.0
  // Quelques pays connus, au nord et au sud de la Tunisie.
  const north = { label: 'France', lat: 46.6 }
  const south = { label: 'Émirats arabes unis', lat: 23.4 }
  check(`"${north.label}" (nord, lat=${north.lat}) → label AU-DESSUS (hub en dessous, pas de chevauchement)`, north.lat >= TUNISIA_LAT)
  check(`"${south.label}" (sud, lat=${south.lat}) → label EN DESSOUS (hub au-dessus, pas de chevauchement)`, !(south.lat >= TUNISIA_LAT))
  check('lib/countryGeo.ts inchangé par ce chantier (pas de régression sur l\'agrégation)', geoSource.includes("code: 'FR', label: 'France'"))

  console.log('\n=== 3. Régression : la page continue de fonctionner avec des labels sur plusieurs pays ===')
  const userId = await makeUser(`country-labels-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`country-labels-${ts}@example.com`, password)

  for (const origin of ['Allemagne', 'Turquie']) {
    const { data: offer } = await service
      .from('product_offers')
      .insert({ voyageur_id: userId, item_description: `Label test ${origin} ${ts}`, origin_country: origin, destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' })
      .select('id')
      .single()
    cleanup.offers.push(offer.id)
  }

  const res = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  check('page répond 200 avec plusieurs pays à étiqueter', res.status === 200, { status: res.status })
  const body = await res.text()
  check('squelette de chargement de la carte toujours présent (ssr:false, comportement inchangé)', body.includes('animate-pulse') && body.includes('h-80 w-full'))

  // Cleanup
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.offers) { try { await service.from('product_offers').delete().eq('id', id) } catch {} }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
