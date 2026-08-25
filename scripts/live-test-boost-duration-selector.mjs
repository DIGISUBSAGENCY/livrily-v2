// Tests en direct de la bascule des CTA existants vers le sélecteur de
// durée (Phase 3, brique 7/N — commit 1) : BoostPayment.tsx doit maintenant
// afficher les 7 paliers (get_boost_pricing_tiers()) et l'achat doit
// utiliser la RPC 4-arg (p_duration_days). Le SQL/RPC lui-même est déjà
// couvert par scripts/live-test-boost-pricing-tiers.mjs (23/23) — ce
// script-ci vérifie uniquement le rendu SSR (le <select> ne peut pas être
// "changé" sans navigateur, mais son contenu HTML — options, prix, durée
// par défaut — est vérifiable via un fetch brut).
//
// Usage : npm run dev (autre terminal), puis
//   node scripts/live-test-boost-duration-selector.mjs
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
    full_name: 'Boost Selector Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
const cleanup = { users: [], trips: [], offers: [] }

async function run() {
  const voyageurId = await makeUser(`boost-sel-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const { cookieHeader: voyageurCookie } = await signInSession(`boost-sel-voyageur-${ts}@example.com`, password)

  const { data: tiers } = await service.from('boost_pricing_tiers').select('*').order('duration_days')
  console.log('Grille actuelle:', tiers.map((t) => `${t.duration_days}j=${t.price_tnd}`).join(', '))

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // ==========================================================================
  // 1. Fiche trip — sélecteur de durée avec les 7 options et les bons prix
  // ==========================================================================
  console.log('\n=== 1. Fiche trip (propriétaire, open) ===')
  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'SelFR', destination_city: 'SelTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id')
    .single()
  cleanup.trips.push(trip.id)

  const tripRes = await fetch(`${BASE}/jibli/trips/${trip.id}`, { headers: { cookie: voyageurCookie } })
  const tripBody = await tripRes.text()
  check('page répond 200', tripRes.status === 200, { status: tripRes.status })
  check('un <select name="duration_days"> est présent', tripBody.includes('name="duration_days"'), { status: tripRes.status })
  for (const tier of tiers) {
    check(`option ${tier.duration_days}j présente avec value="${tier.duration_days}"`, tripBody.includes(`value="${tier.duration_days}"`))
  }
  const bodyFlat = tripBody.replace(/<!--\s*-->/g, '')
  check('durée par défaut 3j pré-sélectionnée dans le texte de tête', bodyFlat.includes('3 jour'))
  const tier3 = tiers.find((t) => t.duration_days === 3)
  check('prix par défaut (3j) affiché', bodyFlat.includes(`${Number(tier3.price_tnd).toFixed(3)} DT`), {
    expected: Number(tier3.price_tnd).toFixed(3),
  })

  // ==========================================================================
  // 2. Fiche offre — même vérification
  // ==========================================================================
  console.log('\n=== 2. Fiche offre (propriétaire, open) ===')
  const { data: offer } = await service
    .from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Sel offer ${ts}`, origin_country: 'SelFR', destination_city: 'SelTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open' })
    .select('id')
    .single()
  cleanup.offers.push(offer.id)

  const offerRes = await fetch(`${BASE}/jibli/offres/${offer.id}`, { headers: { cookie: voyageurCookie } })
  const offerBody = await offerRes.text()
  check('page répond 200', offerRes.status === 200, { status: offerRes.status })
  check('un <select name="duration_days"> est présent', offerBody.includes('name="duration_days"'))
  check('7 options présentes (toutes les value=)', tiers.every((t) => offerBody.includes(`value="${t.duration_days}"`)))

  // ==========================================================================
  // 3. Achat réel via la RPC 4-arg (simule ce que le Server Action ferait
  //    après soumission du formulaire — le fichier upload lui-même n'est
  //    pas simulable sans navigateur, la RPC l'est).
  // ==========================================================================
  console.log('\n=== 3. Achat réel (durée choisie = 6j, différente du défaut 3j) ===')
  const { supabase: voyageurClient } = await signInSession(`boost-sel-voyageur-${ts}@example.com`, password)
  const { data: purchase, error: purchaseErr } = await voyageurClient.rpc('purchase_boost_virement', {
    p_item_type: 'trip', p_item_id: trip.id, p_payment_proof_url: 'fixtures/sel-6j.jpg', p_duration_days: 6,
  })
  check('achat 6j réussit', !purchaseErr, { purchaseErr })
  const tier6 = tiers.find((t) => t.duration_days === 6)
  const { data: paymentRow } = await service.from('boost_payments').select('amount, duration_days').eq('trip_id', trip.id).single()
  check('montant facturé = prix du palier 6j (pas le palier par défaut 3j)', Number(paymentRow.amount) === Number(tier6.price_tnd) && paymentRow.duration_days === 6, {
    paymentRow, tier6,
  })

  // Rafraîchit la fiche : badge "En avant" + message de cumul doivent
  // apparaître, indépendamment de la durée qui a servi à l'achat.
  const tripAfterRes = await fetch(`${BASE}/jibli/trips/${trip.id}`, { headers: { cookie: voyageurCookie } })
  const tripAfterBody = (await tripAfterRes.text()).replace(/<!--\s*-->/g, '')
  check('badge "En avant" affiché après achat', tripAfterBody.includes('En avant'))
  // "jusqu'au" : l'apostrophe est échappée en &#x27; par le rendu React,
  // recherche sans elle (même classe d'artefact que le <!-- --> plus haut).
  check('message de cumul ("Déjà en avant jusqu\'au") affiché', tripAfterBody.includes('Déjà en avant jusqu'))

  // Cleanup
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
