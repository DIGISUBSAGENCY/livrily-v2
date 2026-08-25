// Test en direct du chantier admin completeness, point 2 (couche SQL) —
// rejet des paiements Boost et Jibli.
//
// reject_boost_payment() : garde is_admin, rejet + REPLAY de l'historique
// pour recalculer boosted_until — dont le cas piège qui justifiait le
// replay plutôt qu'une soustraction naïve (paiement frauduleux expiré puis
// achat honnête ultérieur : soustraire mangerait du temps honnêtement
// payé), le chemin travel_requests (bypass du trigger d'invariants), la
// suppression de la notif "Boost terminé" redondante, et l'idempotence
// (double rejet refusé).
//
// resubmit_travel_payment_proof() : cycle complet Option B — paiement
// rejeté (simulé par l'update admin exact que fera la future Server
// Action) → re-soumission client → repasse 'awaiting_verification' avec
// verified_by/at vidés ; garde propriétaire ; re-soumission hors état
// 'rejected' refusée.
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
    full_name: 'Rejection Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
  return supabase
}

const DAY = 24 * 3600 * 1000
function daysFromNow(n) { return new Date(Date.now() + n * DAY).toISOString() }
// Tolérance de comparaison de timestamps : replay = created_at + durée,
// comparé à la valeur attendue calculée côté JS — 5s de marge.
function closeTo(actual, expectedMs) { return Math.abs(new Date(actual).getTime() - expectedMs) < 5000 }

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], offers: [], requests: [], payments: [] }

async function run() {
  const voyageurId = await makeUser(`reject-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)
  const clientId = await makeUser(`reject-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const client = await signInSession(`reject-client-${ts}@example.com`, password)
  const voyageur = await signInSession(`reject-voyageur-${ts}@example.com`, password)
  const adminId = await makeUser(`reject-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const admin = await signInSession(`reject-admin-${ts}@example.com`, password)

  const travelDate = daysFromNow(5).slice(0, 10)

  // ==========================================================================
  // 1. reject_boost_payment — garde is_admin
  // ==========================================================================
  console.log('\n=== 1. Garde is_admin ===')
  const { data: trip1 } = await service.from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'RejFR', destination_city: 'RejTN', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: daysFromNow(3) })
    .select('id').single()
  cleanup.trips.push(trip1.id)
  const { data: pay1 } = await service.from('boost_payments')
    .insert({ voyageur_id: voyageurId, trip_id: trip1.id, payment_method: 'virement', payment_proof_url: 'https://example.com/p1.jpg', amount: 5, duration_days: 3, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(pay1.id)

  const { error: nonAdminErr } = await voyageur.rpc('reject_boost_payment', { p_payment_id: pay1.id })
  check('non-admin : rejet refusé (garde is_admin)', !!nonAdminErr, { nonAdminErr })
  const { data: pay1Untouched } = await service.from('boost_payments').select('status').eq('id', pay1.id).single()
  check('paiement toujours awaiting après tentative non-admin', pay1Untouched?.status === 'awaiting_verification', { pay1Untouched })

  // ==========================================================================
  // 2. Rejet simple : seul paiement de l'item → boosted_until = null
  // ==========================================================================
  console.log('\n=== 2. Rejet simple (dernier paiement → boost révoqué) ===')
  const { error: rejErr } = await admin.rpc('reject_boost_payment', { p_payment_id: pay1.id })
  check('admin : rejet réussit', !rejErr, { rejErr })
  const { data: pay1After } = await service.from('boost_payments').select('status, verified_by').eq('id', pay1.id).single()
  check('paiement passé à rejected, verified_by = admin', pay1After?.status === 'rejected' && pay1After?.verified_by === adminId, { pay1After })
  const { data: trip1After } = await service.from('trips').select('boosted_until').eq('id', trip1.id).single()
  check('boosted_until = null (aucun paiement restant)', trip1After?.boosted_until === null, { trip1After })

  const { data: rejNotif } = await service.from('notifications')
    .select('title, related_object_type, related_object_id')
    .eq('user_id', voyageurId).eq('type', 'boost_update').eq('related_object_id', trip1.id).limit(1)
  check('notification "Virement rejeté" créée pour le payeur', rejNotif?.[0]?.title === 'Virement rejeté' && rejNotif?.[0]?.related_object_type === 'trip', { rejNotif })

  const { error: doubleRejErr } = await admin.rpc('reject_boost_payment', { p_payment_id: pay1.id })
  check('double rejet refusé (plus awaiting)', !!doubleRejErr, { doubleRejErr })

  // ==========================================================================
  // 3. Cas piège : frauduleux EXPIRÉ + achat honnête ultérieur. Une
  //    soustraction naïve tuerait le boost honnête ; le replay doit le
  //    préserver exactement (until = created_at honnête + sa durée).
  // ==========================================================================
  console.log('\n=== 3. Cas piège replay (frauduleux expiré + honnête récent) ===')
  const fraudCreated = new Date(Date.now() - 10 * DAY).toISOString() // boost 3j → expiré depuis 7j
  const honestCreated = new Date(Date.now() - 1 * DAY).toISOString() // boost 3j → jusqu'à +2j
  const honestExpected = new Date(honestCreated).getTime() + 3 * DAY

  const { data: offer1 } = await service.from('product_offers')
    .insert({ voyageur_id: voyageurId, item_description: `Rej offer ${ts}`, origin_country: 'RejFR', destination_city: 'RejTN', travel_date: travelDate, item_price: 100, delivery_fee: 20, status: 'open', boosted_until: new Date(honestExpected).toISOString() })
    .select('id').single()
  cleanup.offers.push(offer1.id)
  const { data: fraudPay } = await service.from('boost_payments')
    .insert({ voyageur_id: voyageurId, product_offer_id: offer1.id, payment_method: 'virement', payment_proof_url: 'https://example.com/fraud.jpg', amount: 5, duration_days: 3, status: 'awaiting_verification', created_at: fraudCreated })
    .select('id').single()
  cleanup.payments.push(fraudPay.id)
  const { data: honestPay } = await service.from('boost_payments')
    .insert({ voyageur_id: voyageurId, product_offer_id: offer1.id, payment_method: 'virement', payment_proof_url: 'https://example.com/honest.jpg', amount: 5, duration_days: 3, status: 'paid', created_at: honestCreated })
    .select('id').single()
  cleanup.payments.push(honestPay.id)

  const { error: fraudRejErr } = await admin.rpc('reject_boost_payment', { p_payment_id: fraudPay.id })
  check('rejet du paiement frauduleux réussit', !fraudRejErr, { fraudRejErr })
  const { data: offer1After } = await service.from('product_offers').select('boosted_until, boost_expiry_notified_at').eq('id', offer1.id).single()
  check('replay préserve exactement le boost honnête (created_at honnête + 3j)', closeTo(offer1After?.boosted_until, honestExpected), { got: offer1After?.boosted_until, expected: new Date(honestExpected).toISOString() })
  check('boost_expiry_notified_at NON touché (until encore futur)', offer1After?.boost_expiry_notified_at === null, { offer1After })

  // ==========================================================================
  // 4. Replay laissant un until déjà échu → boost_expiry_notified_at posé
  //    (supprime la notif cron "Boost terminé" redondante).
  // ==========================================================================
  console.log('\n=== 4. Replay vers un until échu → notif cron supprimée ===')
  const oldPaidCreated = new Date(Date.now() - 20 * DAY).toISOString() // paid, 3j → échu depuis 17j
  const { data: trip2 } = await service.from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'RejFR2', destination_city: 'RejTN2', travel_date: travelDate, available_weight_kg: 10, status: 'open', boosted_until: daysFromNow(3), boost_expiry_notified_at: null })
    .select('id').single()
  cleanup.trips.push(trip2.id)
  const { data: oldPaid } = await service.from('boost_payments')
    .insert({ voyageur_id: voyageurId, trip_id: trip2.id, payment_method: 'virement', payment_proof_url: 'https://example.com/old.jpg', amount: 5, duration_days: 3, status: 'paid', created_at: oldPaidCreated })
    .select('id').single()
  cleanup.payments.push(oldPaid.id)
  const { data: freshAwaiting } = await service.from('boost_payments')
    .insert({ voyageur_id: voyageurId, trip_id: trip2.id, payment_method: 'virement', payment_proof_url: 'https://example.com/fresh.jpg', amount: 5, duration_days: 3, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(freshAwaiting.id)

  await admin.rpc('reject_boost_payment', { p_payment_id: freshAwaiting.id })
  const { data: trip2After } = await service.from('trips').select('boosted_until, boost_expiry_notified_at').eq('id', trip2.id).single()
  const oldExpected = new Date(oldPaidCreated).getTime() + 3 * DAY
  check('replay = paiement ancien seul (created_at + 3j, dans le passé)', closeTo(trip2After?.boosted_until, oldExpected), { got: trip2After?.boosted_until })
  check('boost_expiry_notified_at posé (until échu → pas de notif cron redondante)', trip2After?.boost_expiry_notified_at !== null, { trip2After })

  // ==========================================================================
  // 5. Chemin travel_requests (bypass du trigger d'invariants)
  // ==========================================================================
  console.log('\n=== 5. Rejet sur une demande (bypass trigger) ===')
  const { data: req1 } = await service.from('travel_requests')
    .insert({ client_id: clientId, item_description: `Rej request ${ts}`, origin_country: 'RejFR', destination_city: 'RejTN', needed_by: travelDate, budget_max: 100, item_weight_kg: 1, status: 'open', boosted_until: daysFromNow(2) })
    .select('id').single()
  cleanup.requests.push(req1.id)
  const { data: reqPay } = await service.from('boost_payments')
    .insert({ voyageur_id: clientId, request_id: req1.id, payment_method: 'virement', payment_proof_url: 'https://example.com/req.jpg', amount: 3.5, duration_days: 2, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(reqPay.id)

  const { error: reqRejErr } = await admin.rpc('reject_boost_payment', { p_payment_id: reqPay.id })
  check('rejet sur une demande réussit (trigger bypassé)', !reqRejErr, { reqRejErr })
  const { data: req1After } = await service.from('travel_requests').select('boosted_until, status').eq('id', req1.id).single()
  check('boosted_until = null, statut de la demande intact', req1After?.boosted_until === null && req1After?.status === 'open', { req1After })

  // ==========================================================================
  // 6. resubmit_travel_payment_proof — cycle complet Option B
  // ==========================================================================
  console.log('\n=== 6. Cycle rejet → re-soumission (travel_payments) ===')
  // Vraie chaîne : demande → proposition (voyageur) → acceptation virement
  // (client, RPC réelle) → paiement awaiting.
  const { data: req2 } = await service.from('travel_requests')
    .insert({ client_id: clientId, item_description: `Rej mission ${ts}`, origin_country: 'RejFR', destination_city: 'RejTN', needed_by: travelDate, budget_max: 200, status: 'open' })
    .select('id').single()
  cleanup.requests.push(req2.id)
  const { data: prop } = await voyageur.from('travel_proposals')
    .insert({ request_id: req2.id, voyageur_id: voyageurId, item_price: 100, delivery_fee: 30 })
    .select('id').single()
  const { error: acceptErr } = await client.rpc('accept_travel_proposal', {
    p_proposal_id: prop.id, p_payment_method: 'virement', p_payment_proof_url: `${clientId}/${req2.id}.jpg`,
  })
  check('acceptation virement réussit (setup)', !acceptErr, { acceptErr })

  // Rejet admin — exactement l'update que fera la future Server Action
  // rejectTravelPayment (session admin réelle, policy
  // travel_payments_update_admin_only).
  const { error: tpRejErr } = await admin.from('travel_payments')
    .update({ status: 'rejected', verified_by: adminId, verified_at: new Date().toISOString() })
    .eq('request_id', req2.id).eq('status', 'awaiting_verification')
  check('admin : passage à rejected via la policy existante réussit', !tpRejErr, { tpRejErr })

  const { data: reqStillMatched } = await service.from('travel_requests').select('status').eq('id', req2.id).single()
  check('la mission reste matched (Option B, pas d\'unwind)', reqStillMatched?.status === 'matched', { reqStillMatched })

  // Mauvais appelant : le voyageur ne peut pas re-soumettre.
  const { error: wrongCallerErr } = await voyageur.rpc('resubmit_travel_payment_proof', {
    p_request_id: req2.id, p_payment_proof_url: `${voyageurId}/hack.jpg`,
  })
  check('voyageur : re-soumission refusée (pas le client)', !!wrongCallerErr, { wrongCallerErr })

  // Re-soumission légitime.
  const newProof = `${clientId}/${req2.id}-resubmit-${ts}.jpg`
  const { error: resubmitErr } = await client.rpc('resubmit_travel_payment_proof', {
    p_request_id: req2.id, p_payment_proof_url: newProof,
  })
  check('client : re-soumission réussit', !resubmitErr, { resubmitErr })
  const { data: tpAfter } = await service.from('travel_payments')
    .select('status, payment_proof_url, verified_by, verified_at').eq('request_id', req2.id).single()
  check('paiement repassé à awaiting_verification, nouvelle preuve, verified_by/at vidés',
    tpAfter?.status === 'awaiting_verification' && tpAfter?.payment_proof_url === newProof && tpAfter?.verified_by === null && tpAfter?.verified_at === null, { tpAfter })

  // Re-soumission hors état rejected → refusée.
  const { error: resubmitAgainErr } = await client.rpc('resubmit_travel_payment_proof', {
    p_request_id: req2.id, p_payment_proof_url: `${clientId}/again.jpg`,
  })
  check('re-soumission sur un paiement non-rejeté refusée', !!resubmitAgainErr, { resubmitAgainErr })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
    for (const id of [...cleanup.trips, ...cleanup.offers, ...cleanup.requests]) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
    }
    for (const id of cleanup.requests) {
      try { await service.from('disputes').delete().eq('travel_request_id', id) } catch {}
      try { await service.from('travel_payments').delete().eq('request_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('request_id', id) } catch {}
      // Demande d'abord : accepted_proposal_id référence la proposition
      // (supprimer la proposition en premier violerait cette FK) — les
      // propositions partent ensuite par cascade (request_id on delete cascade).
      try { await service.from('travel_requests').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.trips) { try { await service.from('boost_payments').delete().eq('trip_id', id); await service.from('trips').delete().eq('id', id) } catch {} }
    for (const id of cleanup.offers) { try { await service.from('boost_payments').delete().eq('product_offer_id', id); await service.from('product_offers').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
