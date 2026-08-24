// Tests en direct de la couche TypeScript du Boost payant (Phase 3, brique
// 5/N) — purchase_boost_virement() lui-même est déjà couvert par
// scripts/live-test-boost-payments.mjs (15/15) ; ce script-ci vérifie ce
// qui ne l'était pas encore :
//   1. CTA "Booster" (BoostPayment) visible sur les fiches trip/offre pour
//      le propriétaire d'un item 'open', absent sinon (non-propriétaire,
//      item non-open).
//   2. Badge "En avant" + tri boosté-en-premier sur les listings (trips et
//      offres) et sur les fiches détail.
//   3. "Booster" sur /jibli/mes-offres pour une offre 'open'.
//   4. La policy boost_payments_update_admin_only (nouvelle, cf. schema.sql) :
//      un admin peut faire transitionner un paiement vers 'paid', un
//      non-admin ne peut pas — c'est exactement ce dont dépend
//      verifyBoostPayment() (admin/boost-paiements/actions.ts).
//   5. /admin/boost-paiements affiche bien un paiement en attente.
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-boost-typescript.mjs
import { readFileSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHmac } from 'node:crypto'

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
    full_name: 'Boost TS Test',
    phone: '+21600000000',
    address: '1 rue de test',
    country: 'TN',
    ...extra,
  }).eq('id', data.user.id)
  return data.user.id
}

// Jar de cookies + client servent à la fois de "session navigateur" (RPC
// directs) et à fournir le header Cookie pour les fetch() bruts vers le
// serveur dev — même technique que les scripts précédents. cookieHeader()
// est une fonction (pas juste une valeur figée à l'instant du sign-in) car
// enrollAndVerifyTotp() ci-dessous modifie le jar après coup (élévation à
// aal2) — il faut relire le jar à ce moment-là, pas la valeur capturée trop
// tôt.
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
  const cookieHeader = () => Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { supabase, cookieHeader }
}

// /admin/* exige aal2 pour TOUT compte admin (middleware.ts) — même un
// admin de test doit enrôler ET vérifier un facteur TOTP avant de pouvoir
// charger une page /admin/*, sinon redirection vers /admin/2fa. Algorithme
// TOTP réimplémenté ici (pas de lib externe) — même technique que
// scripts/smoke-test-admin-rendering.mjs (base32Decode + HOTP/RFC 6238).
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of base32.replace(/=+$/, '').toUpperCase()) {
    const val = alphabet.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function generateTotp(secretBase32, timeStepSeconds = 30, digits = 6) {
  const key = base32Decode(secretBase32)
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (binCode % 10 ** digits).toString().padStart(digits, '0')
}
async function enrollAndVerifyTotp(supabase) {
  const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) throw enrollErr
  const code = generateTotp(enrollData.totp.secret)
  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code })
  if (verifyErr) throw verifyErr
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], offers: [], payments: [] }

async function run() {
  const voyageurId = await makeUser(`boost-ts-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const { supabase: voyageur, cookieHeader: voyageurCookieFn } = await signInSession(`boost-ts-voyageur-${ts}@example.com`, password)
  const voyageurCookie = voyageurCookieFn()

  const otherId = await makeUser(`boost-ts-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const { cookieHeader: otherCookieFn } = await signInSession(`boost-ts-other-${ts}@example.com`, password)
  const otherCookie = otherCookieFn()

  const adminId = await makeUser(`boost-ts-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`boost-ts-admin-${ts}@example.com`, password)
  // aal2 requis pour TOUTE route /admin/* (middleware.ts) — enrôle ET
  // vérifie un facteur TOTP sur CETTE session avant d'y toucher, puis
  // relit le jar (adminCookieFn(), pas une valeur figée avant l'enrôlement).
  await enrollAndVerifyTotp(admin)
  const adminCookie = adminCookieFn()

  const { data: settings } = await service.from('platform_settings').select('boost_price_tnd, boost_duration_days').eq('id', true).single()

  const { data: pricingViaRpc, error: pricingErr } = await voyageur.rpc('get_boost_pricing')
  console.log('\n=== 0. get_boost_pricing() (nouvelle RPC — platform_settings est admin-only en RLS) ===')
  check('get_boost_pricing() accessible à un client authentifié non-admin', !pricingErr, { pricingErr })
  check('get_boost_pricing() renvoie les mêmes valeurs que platform_settings', pricingViaRpc?.[0]?.boost_price_tnd === settings.boost_price_tnd && pricingViaRpc?.[0]?.boost_duration_days === settings.boost_duration_days, {
    pricingViaRpc, settings,
  })

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // ==========================================================================
  // 1. CTA "Booster" (BoostPayment) — présent pour le propriétaire d'un
  //    trip/offre 'open', absent pour un tiers ou un item non-open.
  // ==========================================================================
  console.log('\n=== 1. CTA Booster sur les fiches détail ===')
  const { data: openTrip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostTsFR', destination_city: 'BoostTsTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(openTrip.id)

  const { data: matchedTrip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostTsFR2', destination_city: 'BoostTsTN2', travel_date: travelDate, available_weight_kg: 10, status: 'matched' })
    .select('id')
    .single()
  cleanup.trips.push(matchedTrip.id)

  const ownerTripRes = await fetch(`${BASE}/jibli/trips/${openTrip.id}`, { headers: { cookie: voyageurCookie } })
  const ownerTripBody = await ownerTripRes.text()
  check('trip open, propriétaire : CTA Booster présent (input payment_proof)', ownerTripBody.includes('name="payment_proof"'), { status: ownerTripRes.status })
  // .replace() : React (SSR streaming) insère des <!-- --> entre les
  // expressions JSX voisines ("3<!-- --> jour<!-- -->s") — retirés avant
  // de chercher la sous-chaîne, sinon faux FAIL sur un rendu pourtant
  // correct (vérifié en clair via un fetch brut pendant le débogage).
  const ownerTripBodyFlat = ownerTripBody.replace(/<!--\s*-->/g, '')
  check('trip open, propriétaire : prix/durée affichés', ownerTripBodyFlat.includes(`${settings.boost_duration_days} jour`), { settings })

  const otherTripRes = await fetch(`${BASE}/jibli/trips/${openTrip.id}`, { headers: { cookie: otherCookie } })
  const otherTripBody = await otherTripRes.text()
  check('trip open, non-propriétaire : CTA Booster absent', !otherTripBody.includes('name="payment_proof"'), { status: otherTripRes.status })

  const matchedTripRes = await fetch(`${BASE}/jibli/trips/${matchedTrip.id}`, { headers: { cookie: voyageurCookie } })
  const matchedTripBody = await matchedTripRes.text()
  check('trip matched, propriétaire : CTA Booster absent (pas open)', !matchedTripBody.includes('name="payment_proof"'), { status: matchedTripRes.status })

  const { data: openOffer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Boost TS offer ${ts}`, origin_country: 'BoostTsFR', destination_city: 'BoostTsTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(openOffer.id)

  const ownerOfferRes = await fetch(`${BASE}/jibli/offres/${openOffer.id}`, { headers: { cookie: voyageurCookie } })
  const ownerOfferBody = await ownerOfferRes.text()
  check('offre open, propriétaire : CTA Booster présent', ownerOfferBody.includes('name="payment_proof"'), { status: ownerOfferRes.status })

  // ==========================================================================
  // 2. Badge "En avant" + tri boosté-en-premier — boosted_until posé
  //    directement (simule un achat déjà effectué, RPC déjà testée ailleurs).
  // ==========================================================================
  console.log('\n=== 2. Badge + tri boosté-en-premier ===')
  const { data: boostedTrip } = await service
    .from('trips')
    .insert({
      voyageur_id: voyageurId, origin_country: 'BoostTsBoosted', destination_city: 'BoostTsBoostedDest',
      travel_date: travelDate, available_weight_kg: 10, status: 'open',
      boosted_until: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      created_at: new Date(Date.now() - 999 * 1000).toISOString(), // le plus ANCIEN des deux — sans boost, apparaîtrait dernier
    })
    .select('id')
    .single()
  cleanup.trips.push(boostedTrip.id)

  const boostedDetailRes = await fetch(`${BASE}/jibli/trips/${boostedTrip.id}`, { headers: { cookie: voyageurCookie } })
  const boostedDetailBody = await boostedDetailRes.text()
  check('fiche détail trip boosté : badge "En avant" affiché', boostedDetailBody.includes('En avant'), { status: boostedDetailRes.status })

  const tripsListingRes = await fetch(`${BASE}/jibli/trips`, { headers: { cookie: voyageurCookie } })
  const tripsListingBody = await tripsListingRes.text()
  const idxBoosted = tripsListingBody.indexOf(boostedTrip.id)
  const idxOpen = tripsListingBody.indexOf(openTrip.id)
  check('listing trips : le trip boosté apparaît AVANT le trip non-boosté plus récent', idxBoosted !== -1 && idxOpen !== -1 && idxBoosted < idxOpen, {
    idxBoosted, idxOpen,
  })
  check('listing trips : badge "En avant" présent dans le HTML', tripsListingBody.includes('En avant'))

  // ==========================================================================
  // 3. "Booster" sur /jibli/mes-offres pour une offre open.
  // ==========================================================================
  console.log('\n=== 3. Bouton Booster sur /jibli/mes-offres ===')
  const mesOffresRes = await fetch(`${BASE}/jibli/mes-offres`, { headers: { cookie: voyageurCookie } })
  const mesOffresBody = await mesOffresRes.text()
  check('/jibli/mes-offres répond 200', mesOffresRes.status === 200, { status: mesOffresRes.status })
  check('/jibli/mes-offres : lien vers la fiche de l\'offre open présent (CTA Booster y mène)', mesOffresBody.includes(`/jibli/offres/${openOffer.id}`))

  // ==========================================================================
  // 4. Policy boost_payments_update_admin_only (nouvelle) — admin peut
  //    transitionner vers 'paid', un non-admin ne peut pas. C'est
  //    exactement ce dont dépend verifyBoostPayment().
  // ==========================================================================
  console.log('\n=== 4. Policy UPDATE admin-only sur boost_payments ===')
  const { data: pendingPayment } = await service
    .from('boost_payments')
    .insert({
      voyageur_id: voyageurId, trip_id: openTrip.id, payment_method: 'virement',
      payment_proof_url: `fixtures/boost-ts-${ts}.jpg`, amount: settings.boost_price_tnd, duration_days: settings.boost_duration_days,
    })
    .select('id')
    .single()
  cleanup.payments.push(pendingPayment.id)

  const { data: nonAdminUpdate, error: nonAdminUpdateErr } = await voyageur
    .from('boost_payments')
    .update({ status: 'paid' })
    .eq('id', pendingPayment.id)
    .eq('status', 'awaiting_verification')
    .select('id')
  check('non-admin : update refusé par RLS (0 ligne affectée, pas d\'erreur explicite — RLS silencieux)', !nonAdminUpdateErr && (nonAdminUpdate ?? []).length === 0, {
    nonAdminUpdate, nonAdminUpdateErr,
  })
  const { data: stillPending } = await service.from('boost_payments').select('status').eq('id', pendingPayment.id).single()
  check('non-admin : le statut n\'a pas changé en base', stillPending?.status === 'awaiting_verification', { stillPending })

  const { data: adminUpdate, error: adminUpdateErr } = await admin
    .from('boost_payments')
    .update({ status: 'paid', verified_by: adminId, verified_at: new Date().toISOString() })
    .eq('id', pendingPayment.id)
    .eq('status', 'awaiting_verification')
    .select('id, status')
  check('admin : update réussit (policy boost_payments_update_admin_only active)', !adminUpdateErr && (adminUpdate ?? []).length === 1 && adminUpdate[0].status === 'paid', {
    adminUpdate, adminUpdateErr,
  })

  // ==========================================================================
  // 5. /admin/boost-paiements affiche un paiement en attente.
  // ==========================================================================
  console.log('\n=== 5. /admin/boost-paiements ===')
  const { data: secondPending } = await service
    .from('boost_payments')
    .insert({
      voyageur_id: voyageurId, trip_id: openTrip.id, payment_method: 'virement',
      payment_proof_url: `fixtures/boost-ts-2-${ts}.jpg`, amount: settings.boost_price_tnd, duration_days: settings.boost_duration_days,
    })
    .select('id')
    .single()
  cleanup.payments.push(secondPending.id)

  const adminPageRes = await fetch(`${BASE}/admin/boost-paiements`, { headers: { cookie: adminCookie } })
  const adminPageBody = await adminPageRes.text()
  check('/admin/boost-paiements répond 200', adminPageRes.status === 200, { status: adminPageRes.status })
  check('/admin/boost-paiements : le trip du paiement en attente apparaît', adminPageBody.includes('BoostTsFR'))
  check('/admin/boost-paiements : le montant apparaît', adminPageBody.includes(Number(settings.boost_price_tnd).toFixed(3)))

  const nonAdminPageRes = await fetch(`${BASE}/admin/boost-paiements`, { headers: { cookie: otherCookie }, redirect: 'manual' })
  check('/admin/boost-paiements : non-admin redirigé (pas 200)', nonAdminPageRes.status !== 200, { status: nonAdminPageRes.status })

  // Cleanup
  for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
  for (const id of cleanup.trips) {
    try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
    try { await service.from('trips').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.offers) {
    try { await service.from('boost_payments').delete().eq('product_offer_id', id) } catch {}
    try { await service.from('product_offers').delete().eq('id', id) } catch {}
  }
  for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
  process.exit(1)
})
