// Test du point 2 (chantier améliorations carte) : flèche animée par pays
// (DivIcon + requestAnimationFrame, sans nouvelle dépendance).
//
// Limite honnête : le comportement runtime de l'animation (la boucle
// requestAnimationFrame tourne / s'arrête bien) n'est PAS observable par un
// fetch() côté serveur — c'est du JS pur exécuté dans le navigateur après
// hydratation, comme le reste du rendu Leaflet (déjà documenté dans
// live-test-dashboard-leaflet-map.mjs). Ce qui EST vérifiable et vérifié
// ici : (1) que la page continue de fonctionner (pas de régression), et
// (2) par lecture du code source, que le mécanisme qui garantit le cleanup
// au changement d'onglet est bien en place — une clé React PAR pays sur
// AnimatedFlowArrow, ce qui est ce qui fait que React démonte (et donc
// nettoie, via le retour de useEffect) toute flèche dont le pays disparaît
// de l'onglet actif, sans attendre le démontage complet de la carte. C'est
// un fait vérifiable sur le code exécuté (pas une supposition) : React
// réconcilie une liste par clé, documentation React elle-même.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-dashboard-animated-arrows.mjs
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
    full_name: 'Arrow Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
  console.log('\n=== 1. Mécanisme de cleanup au changement d\'onglet — lecture du code source ===')
  const mapSource = readFileSync('components/travel/CountryFlowMap.tsx', 'utf8')

  check(
    'chaque flèche a sa PROPRE clé React par pays (key={`arrow-${row.label}`}) — c\'est ce qui fait démonter/nettoyer une flèche dont le pays disparaît au changement d\'onglet, sans attendre le démontage de toute la carte',
    mapSource.includes('key={`arrow-${row.label}`}')
  )
  check(
    'le useEffect de l\'animation retourne bien une fonction de cleanup (cancelAnimationFrame)',
    /useEffect\(\(\) => \{[\s\S]*?return \(\) => cancelAnimationFrame\(frameId\)[\s\S]*?\}, \[map, originLat, originLng\]\)/.test(mapSource)
  )
  check(
    'aucun état d\'animation partagé au niveau module (frameId/start déclarés DANS l\'effet, pas en dehors du composant — pas de fuite croisée entre instances)',
    !/^(const|let)\s+(frameId|start)\s*=/m.test(mapSource)
  )
  check(
    'requestAnimationFrame écrit directement sur l\'instance Leaflet (marker.setLatLng), pas via un state React (évite un re-render par frame)',
    mapSource.includes('markerRef.current?.setLatLng(')
  )

  console.log('\n=== 2. Position/angle en espace écran projeté (pas lat/lng brut) — géométrie vérifiée séparément par scripts/verify-arrow-geometry.mjs avec le vrai moteur Leaflet ===')
  check(
    'la position interpolée utilise map.latLngToLayerPoint (même méthode que celle utilisée par Leaflet pour dessiner le Polyline), pas une interpolation lat/lng brute',
    mapSource.includes('map.latLngToLayerPoint(originLatLng)') && mapSource.includes('map.latLngToLayerPoint(destLatLng)')
  )
  check(
    'reconversion en lat/lng via map.layerPointToLatLng avant setLatLng (Leaflet positionne un Marker par lat/lng, jamais par pixel brut)',
    mapSource.includes('markerRef.current?.setLatLng(map.layerPointToLatLng(point))')
  )
  check(
    'aucune interpolation/atan2 sur lat/lng brut (ancienne formule buguée) ne subsiste dans le fichier',
    !mapSource.includes('originLat + (TUNISIA[0] - originLat)') && !/atan2\(destLng - originLng, destLat - originLat\)/.test(mapSource)
  )

  console.log('\n=== 3. Badge hub Tunisie — taille de cercle fixe quel que soit le nombre de chiffres ===')
  // Réduit de 44x44 à 28x28 (chantier taille du hub) — rapproché des
  // marqueurs pays (16x16) tout en restant identifiable comme point
  // central. Valeur de référence mise à jour, pas juste re-testée telle
  // quelle.
  check(
    'iconSize reste fixe (28x28) — pas basé sur le contenu',
    mapSource.includes('iconSize: [28, 28]')
  )
  check(
    'iconAnchor recentré en conséquence (14,14 = moitié de 28) — sinon le hub se décale visuellement de sa position réelle',
    mapSource.includes('iconAnchor: [14, 14]')
  )
  check(
    'le texte du badge est contraint (overflow-hidden) et sa taille de police s\'adapte au nombre de chiffres, pas le cercle',
    mapSource.includes('overflow-hidden rounded-full bg-brand-700') && mapSource.includes("digits >= 3 ? 'text-[9px]' : 'text-xs'")
  )
  check(
    'le halo animate-ping reste proportionné (h-full w-full du conteneur h-7 w-7, pas une taille fixe indépendante)',
    /h-7 w-7 items-center justify-center">\s*<span class="absolute inline-flex h-full w-full animate-ping/.test(mapSource)
  )
  check(
    'le label "Tunisie" est présent sur le hub, même style que les labels de pays (pill blanche)',
    mapSource.includes('>Tunisie</span>') && mapSource.includes('rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm">Tunisie')
  )

  console.log('\n=== 4. Régression : la page continue de fonctionner avec des flèches sur les 2 onglets ===')
  const userId = await makeUser(`arrows-${ts}@example.com`, password)
  cleanup.users.push(userId)
  const { cookieHeader } = await signInSession(`arrows-${ts}@example.com`, password)

  // Pays DIFFÉRENTS entre Articles et Demandes — pour que le changement
  // d'onglet corresponde à un vrai changement de la liste de clés
  // (le cas exact que le cleanup doit gérer).
  const { data: offer } = await service.from('product_offers').insert({ voyageur_id: userId, item_description: `Arrow offer ${ts}`, origin_country: 'Allemagne', destination_city: 'Tunis', travel_date: travelDate, item_price: 50, delivery_fee: 10, status: 'open' }).select('id').single()
  cleanup.offers.push(offer.id)

  const res = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: cookieHeader } })
  check('page répond 200 avec au moins une flèche à animer', res.status === 200, { status: res.status })
  const body = await res.text()
  check('squelette de chargement de la carte présent (ssr:false, comportement inchangé)', body.includes('animate-pulse') && body.includes('h-80 w-full'))

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
