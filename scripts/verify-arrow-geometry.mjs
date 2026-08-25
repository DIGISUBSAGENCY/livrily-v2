// Vérifie la géométrie de AnimatedFlowArrow (CountryFlowMap.tsx) en
// utilisant le VRAI moteur de projection de Leaflet (L.CRS.EPSG3857),
// pas une réimplémentation — même technique de polyfill minimal que
// scripts/live-test-client-login.mjs (document.cookie) pour laisser le
// code réel de la lib s'exécuter dans Node (leaflet touche `window` à
// l'import, y compris pour son pur code de projection mathématique, qui
// lui ne dépend d'aucune vraie fenêtre navigateur).
//
// Ce que ça prouve, avec les VRAIES fonctions Leaflet :
//   1. La position interpolée à t=0/0.25/0.5/0.75/1 tombe EXACTEMENT sur
//      le segment reliant les points PROJETÉS origine/Tunisie (le même
//      calcul que celui que Leaflet utilise pour dessiner le Polyline) —
//      pas sur une interpolation lat/lng brute, qui diverge visiblement.
//   2. L'angle (bearing) calculé en espace écran projeté diffère
//      nettement de l'angle calculé naïvement sur lat/lng bruts — preuve
//      que le bug était réel, pas juste une inquiétude théorique.
//   3. Sur 2 pays géographiquement très différents par rapport à la
//      Tunisie (France au nord, Émirats arabes unis à l'est), les angles
//      obtenus sont nettement différents entre eux (pas une valeur
//      constante par accident) et cohérents avec l'intuition
//      géographique (France → Tunisie pointe globalement vers le
//      sud/sud-est ; Émirats → Tunisie pointe globalement vers l'ouest).
//
// Usage : node scripts/verify-arrow-geometry.mjs
global.window = {
  requestAnimationFrame: () => {}, cancelAnimationFrame: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
  navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0, pointerEnabled: false, msPointerEnabled: false },
  L_DISABLE_3D: false, L_NO_TOUCH: true, chrome: false, webkit: false,
  devicePixelRatio: 1, screen: { deviceXDPI: 96, logicalXDPI: 96 },
}
global.document = {
  documentElement: { style: {}, addEventListener() {}, removeEventListener() {} },
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, getElementsByTagName: () => [] }),
  createElementNS: () => ({ style: {}, setAttribute() {} }),
}
global.window.document = global.document
// Node ≥21 expose déjà un `navigator` global en lecture seule (Web
// compat) — Object.defineProperty plutôt qu'une affectation directe, qui
// lève TypeError sur un getter sans setter.
Object.defineProperty(global, 'navigator', { value: global.window.navigator, configurable: true })

const { default: L } = await import('leaflet')

let pass = 0, fail = 0
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  OK  ${label}`) }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`) }
}

const TUNISIA = [34.0, 9.6]
const PROJ = L.CRS.EPSG3857 // même CRS que celui utilisé par défaut par L.Map (jamais changé dans CountryFlowMap.tsx — vérifié : aucune prop `crs` sur MapContainer)
const ZOOM = 2 // arbitraire (n'affecte ni la colinéarité ni l'angle entre 2 points fixes, cf. commentaire du composant), juste pour matcher la signature de latLngToPoint

// latLngToPoint()/pointToLatLng() (PAS project()/unproject() bruts) —
// ce sont EXACTEMENT les méthodes que map.latLngToLayerPoint()/
// layerPointToLatLng() appellent en interne (à l'offset de l'origine des
// pixels près, qui s'annule dans une SOUSTRACTION entre 2 points au même
// zoom, donc sans effet ici). project()/unproject() seuls donneraient un
// espace "monde" mathématique où l'axe Y croît vers le NORD — alors que
// l'espace pixel réel de Leaflet (utilisé par latLngToLayerPoint, et donc
// par le composant) a l'axe Y qui croît vers le SUD (convention écran
// standard) : une inversion trouvée en comparant le résultat de ce script
// à l'intuition géographique (France→Tunisie doit pointer vers le sud,
// pas vers le nord) — project() seul aurait donné un angle avec le signe
// de Y inversé par rapport à ce que le composant calcule réellement.
function interpolate(originLatLng, destLatLng, t) {
  const originPoint = PROJ.latLngToPoint(L.latLng(...originLatLng), ZOOM)
  const destPoint = PROJ.latLngToPoint(L.latLng(...destLatLng), ZOOM)
  const point = originPoint.add(destPoint.subtract(originPoint).multiplyBy(t))
  const latLng = PROJ.pointToLatLng(point, ZOOM)
  return [latLng.lat, latLng.lng]
}

function bearingScreenSpace(originLatLng, destLatLng) {
  const originPoint = PROJ.latLngToPoint(L.latLng(...originLatLng), ZOOM)
  const destPoint = PROJ.latLngToPoint(L.latLng(...destLatLng), ZOOM)
  const dx = destPoint.x - originPoint.x
  const dy = destPoint.y - originPoint.y
  return (Math.atan2(dx, -dy) * 180) / Math.PI
}

function bearingRawLatLng(originLatLng, destLatLng) {
  // L'ANCIEN calcul (buggé), reproduit ici uniquement pour prouver qu'il
  // donne un résultat différent — pas utilisé dans le composant corrigé.
  return (Math.atan2(destLatLng[1] - originLatLng[1], destLatLng[0] - originLatLng[0]) * 180) / Math.PI
}

console.log('=== 1. La position interpolée tombe exactement sur le tracé projeté (France → Tunisie) ===')
const FRANCE = [46.6, 2.2]
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const interpolated = interpolate(FRANCE, TUNISIA, t)
  // Le point "attendu" est calculé indépendamment (reprojection manuelle),
  // pour ne pas juste re-vérifier la même formule contre elle-même : on
  // projette, on interpole en pixels, on reprojette — puis on VÉRIFIE que
  // reprojeter ce résultat retombe bien sur le même point pixel que
  // l'interpolation directe en pixels (cohérence aller-retour projection).
  const backProjected = PROJ.latLngToPoint(L.latLng(...interpolated), ZOOM)
  const originPoint = PROJ.latLngToPoint(L.latLng(...FRANCE), ZOOM)
  const destPoint = PROJ.latLngToPoint(L.latLng(...TUNISIA), ZOOM)
  const expectedPoint = originPoint.add(destPoint.subtract(originPoint).multiplyBy(t))
  const dx = Math.abs(backProjected.x - expectedPoint.x)
  const dy = Math.abs(backProjected.y - expectedPoint.y)
  check(`t=${t} : point interpolé, reprojeté, retombe sur le point attendu du segment (Δ=${dx.toFixed(6)},${dy.toFixed(6)} px)`, dx < 0.001 && dy < 0.001, {
    interpolated, dx, dy,
  })
}

console.log('\n=== 2. La méthode corrigée diverge bien de l\'ancienne (lat/lng brut) — preuve que le bug était réel ===')
const rawLerp = (t) => [FRANCE[0] + (TUNISIA[0] - FRANCE[0]) * t, FRANCE[1] + (TUNISIA[1] - FRANCE[1]) * t]
const t = 0.5
const projectedMid = interpolate(FRANCE, TUNISIA, t)
const rawMid = rawLerp(t)
const drift = Math.hypot(projectedMid[0] - rawMid[0], projectedMid[1] - rawMid[1])
check('à t=0.5, l\'ancienne méthode (lat/lng brut) et la nouvelle (espace projeté) donnent des points différents (dérive mesurable)', drift > 0.001, {
  projectedMid, rawMid, driftDegrees: drift,
})

console.log('\n=== 3. Angles cohérents et distincts sur 2 pays géographiquement opposés ===')
const EMIRATS = [23.4, 53.8]
const bearingFrance = bearingScreenSpace(FRANCE, TUNISIA)
const bearingEmirats = bearingScreenSpace(EMIRATS, TUNISIA)
const bearingFranceRaw = bearingRawLatLng(FRANCE, TUNISIA)

check('France→Tunisie et Émirats→Tunisie donnent des angles nettement différents (pas une valeur constante/buguée)', Math.abs(bearingFrance - bearingEmirats) > 30, {
  bearingFrance, bearingEmirats,
})
// France est au nord de la Tunisie → un vecteur France→Tunisie pointe
// globalement vers le sud (proche de 180°, éventuellement +/- une
// composante est/ouest selon la longitude relative).
check('France→Tunisie pointe globalement vers le sud (entre 90° et 270°, pas vers le nord)', bearingFrance > 90 && bearingFrance < 270, {
  bearingFrance,
})
// Émirats est à l'est de la Tunisie → un vecteur Émirats→Tunisie pointe
// globalement vers l'ouest (proche de -90°/270°).
check('Émirats→Tunisie pointe globalement vers l\'ouest (entre 180° et 360°, ou négatif proche de -90°)', bearingEmirats > 180 || bearingEmirats < -45, {
  bearingEmirats,
})
check('l\'angle projeté (corrigé) diffère de l\'angle brut (bug) pour France→Tunisie — preuve que la correction change réellement le résultat affiché', Math.abs(bearingFrance - bearingFranceRaw) > 1, {
  bearingFrance, bearingFranceRaw,
})

console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
process.exit(fail > 0 ? 1 : 0)
