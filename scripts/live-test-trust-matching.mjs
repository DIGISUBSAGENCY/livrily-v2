// Tests en direct de l'extension Trust Score sur le matching Trips
// (get_trip_matches_for_request / get_request_matches_for_trip) — mêmes
// conventions que scripts/live-test-trust-system.mjs (service_role pour
// les fixtures, vraies sessions @supabase/ssr pour les appels RPC, nettoyage
// systématique).
//
// Usage : node scripts/live-test-trust-matching.mjs
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const value = trimmed.slice(eq + 1).trim()
  if (!(key in process.env)) process.env[key] = value
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const service = createServiceClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0
let fail = 0
function check(label, cond, detail) {
  if (cond) {
    pass++
    console.log(`  OK  ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}${detail ? ' — ' + JSON.stringify(detail) : ''}`)
  }
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
  return { supabase }
}

async function makeUser(email, password) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user.id
}

const cleanup = { users: [], requests: [], trips: [] }

// Portée depuis scripts/live-test-trust-system.mjs (même helper, mission
// menée à 'completed' + paiement 'released' via le vrai chemin RPC — un
// update direct service_role est bloqué par enforce_travel_request_transitions).
async function completeTravelMission(clientSupabase, voyageurSupabase, clientId, voyageurId) {
  const ts = Date.now() + Math.random()
  const { data: req, error: reqErr } = await clientSupabase
    .from('travel_requests')
    .insert({
      client_id: clientId,
      item_description: `Trust matching fixture ${ts}`,
      origin_country: 'France',
      destination_city: 'Tunis',
      budget_max: 50,
    })
    .select('id')
    .single()
  if (reqErr) throw new Error(`insert travel_request: ${reqErr.message}`)

  const { data: prop, error: propErr } = await voyageurSupabase
    .from('travel_proposals')
    .insert({ request_id: req.id, voyageur_id: voyageurId, item_price: 30, delivery_fee: 20 })
    .select('id')
    .single()
  if (propErr) throw new Error(`insert travel_proposal: ${propErr.message}`)

  const { error: acceptErr } = await clientSupabase.rpc('accept_travel_proposal', {
    p_proposal_id: prop.id,
    p_payment_method: 'flouci',
    p_payment_proof_url: null,
    p_payment_ref: `trust-matching-ref-${ts}`,
  })
  if (acceptErr) throw new Error(`accept_travel_proposal: ${acceptErr.message}`)

  const { error: transitErr } = await voyageurSupabase.from('travel_requests').update({ status: 'in_transit' }).eq('id', req.id)
  if (transitErr) throw new Error(`update in_transit: ${transitErr.message}`)

  const { error: completeErr } = await voyageurSupabase.from('travel_requests').update({ status: 'completed' }).eq('id', req.id)
  if (completeErr) throw new Error(`update completed: ${completeErr.message}`)

  const { error: confirmErr } = await clientSupabase.rpc('confirm_travel_receipt', { p_request_id: req.id })
  if (confirmErr) throw new Error(`confirm_travel_receipt: ${confirmErr.message}`)

  return req.id
}

// --- Constructeurs de profils par catégorie de confiance (repris du
//     protocole déjà éprouvé dans live-test-trust-system.mjs) ---

async function makeNewMemberProfile(ts, suffix) {
  // Aucune donnée — score 50, catégorie new_member.
  const id = await makeUser(`match-new-${suffix}-${ts}@example.com`, 'LiveTestPass!23')
  cleanup.users.push(id)
  return id
}

async function makeHighTrustProfile(ts, suffix) {
  // Identité vérifiée (+15) + ancienneté 13 mois (+5) = 65+5 = 70 exactement.
  const id = await makeUser(`match-high-${suffix}-${ts}@example.com`, 'LiveTestPass!23')
  cleanup.users.push(id)
  await service.from('identity_verifications').insert({
    profile_id: id,
    status: 'approved',
    id_document_url: 'fixtures/fake-id.jpg',
    selfie_url: 'fixtures/fake-selfie.jpg',
  })
  await service.from('profiles').update({ created_at: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString() }).eq('id', id)
  return id
}

async function makeLimitedHistoryProfile(ts, suffix) {
  // 5 litiges, aucun signal positif — score 30, catégorie limited_history.
  const id = await makeUser(`match-limited-${suffix}-${ts}@example.com`, 'LiveTestPass!23')
  cleanup.users.push(id)
  for (let i = 0; i < 5; i++) {
    const { data: req } = await service
      .from('travel_requests')
      .insert({
        client_id: id,
        item_description: `Trust matching disputed fixture ${i}`,
        origin_country: 'France',
        destination_city: 'Tunis',
        budget_max: 50,
      })
      .select('id')
      .single()
    await service.from('disputes').insert({ travel_request_id: req.id, opened_by: id, reason: 'fixture', status: 'open' })
    cleanup.requests.push(req.id)
  }
  return id
}

async function makeExcellentProfile(ts, suffix) {
  // Identité (+15) + avis 5/5 (+10) + 3 missions complétées comme client à
  // 100% (+6 volume, +10 ratio) + ancienneté 13 mois (+5) = 50+15+10+6+10+5
  // = 96 (catégorie excellent, >=90) — seule la catégorie compte ici, pas
  // le score exact.
  const id = await makeUser(`match-excellent-${suffix}-${ts}@example.com`, 'LiveTestPass!23')
  cleanup.users.push(id)
  const otherId = await makeUser(`match-excellent-other-${suffix}-${ts}@example.com`, 'LiveTestPass!23')
  cleanup.users.push(otherId)
  const { supabase: mySession } = await signInSession(`match-excellent-${suffix}-${ts}@example.com`, 'LiveTestPass!23')
  const { supabase: otherSession } = await signInSession(`match-excellent-other-${suffix}-${ts}@example.com`, 'LiveTestPass!23')

  await service.from('identity_verifications').insert({
    profile_id: id,
    status: 'approved',
    id_document_url: 'fixtures/fake-id.jpg',
    selfie_url: 'fixtures/fake-selfie.jpg',
  })
  await service.from('profiles').update({ created_at: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString() }).eq('id', id)

  const reqIds = []
  for (let i = 0; i < 3; i++) {
    const reqId = await completeTravelMission(mySession, otherSession, id, otherId)
    reqIds.push(reqId)
    cleanup.requests.push(reqId)
  }

  await service.from('travel_reviews').insert([
    { travel_request_id: reqIds[0], reviewer_id: otherId, reviewee_id: id, direction: 'voyageur_to_client', rating: 5 },
    { travel_request_id: reqIds[0], reviewer_id: id, reviewee_id: otherId, direction: 'client_to_voyageur', rating: 5 },
  ])

  return id
}

async function cleanupAll() {
  for (const tripId of cleanup.trips) {
    await service.from('trips').delete().eq('id', tripId)
  }
  for (const reqId of cleanup.requests) {
    await service.from('disputes').delete().eq('travel_request_id', reqId)
    await service.from('travel_payments').delete().eq('request_id', reqId)
    await service.from('travel_reviews').delete().eq('travel_request_id', reqId)
    await service.from('travel_proposals').delete().eq('request_id', reqId)
    await service.from('travel_requests').delete().eq('id', reqId)
  }
  for (const userId of cleanup.users) {
    await service.from('identity_verifications').delete().eq('profile_id', userId)
    await service.auth.admin.deleteUser(userId)
  }
}

async function run() {
  const ts = Date.now()
  const viewerId = await makeUser(`match-viewer-${ts}@example.com`, 'LiveTestPass!23')
  cleanup.users.push(viewerId)
  const { supabase: viewer } = await signInSession(`match-viewer-${ts}@example.com`, 'LiveTestPass!23')

  // ==========================================================================
  // Scénario 1 : get_trip_matches_for_request — 4 trips, route/date/poids
  // IDENTIQUES (logistics_score identique pour les 4), un voyageur par
  // catégorie de confiance. Vérifie formule du bonus + tri + séparation
  // score/logistics_score.
  // ==========================================================================
  console.log('\n=== get_trip_matches_for_request : bonus par catégorie + tri ===')
  {
    const clientId = await makeUser(`match-client1-${ts}@example.com`, 'LiveTestPass!23')
    cleanup.users.push(clientId)
    const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const { data: req } = await service
      .from('travel_requests')
      .insert({
        client_id: clientId,
        item_description: 'Match test scénario 1',
        origin_country: 'France',
        destination_city: 'Tunis',
        budget_max: 100,
        needed_by: travelDate, // date_bonus = 30 pour tous (écart 0)
        item_weight_kg: 5,
      })
      .select('id')
      .single()
    cleanup.requests.push(req.id)

    const vNew = await makeNewMemberProfile(ts, 's1')
    const vHigh = await makeHighTrustProfile(ts, 's1')
    const vLimited = await makeLimitedHistoryProfile(ts, 's1')
    const vExcellent = await makeExcellentProfile(ts, 's1')

    const tripsByCategory = {}
    for (const [label, voyageurId] of [
      ['new_member', vNew],
      ['high_trust', vHigh],
      ['limited_history', vLimited],
      ['excellent', vExcellent],
    ]) {
      const { data: trip } = await service
        .from('trips')
        .insert({
          voyageur_id: voyageurId,
          origin_country: 'France',
          destination_city: 'Tunis',
          travel_date: travelDate, // écart = 0 → date_bonus = 30 pour tous
          available_weight_kg: 10, // >= 5 → weight_bonus = 20 pour tous
          status: 'open',
        })
        .select('id')
        .single()
      cleanup.trips.push(trip.id)
      tripsByCategory[label] = trip.id
    }

    const { data: matches, error } = await viewer.rpc('get_trip_matches_for_request', { p_request_id: req.id })
    check('get_trip_matches_for_request() ne renvoie pas d\'erreur', !error, { error })

    const byTrip = new Map((matches ?? []).map((m) => [m.trip_id, m]))

    const expected = {
      new_member: { bonus: 5, category: 'new_member' },
      high_trust: { bonus: 10, category: 'high_trust' },
      limited_history: { bonus: 0, category: 'limited_history' },
      excellent: { bonus: 15, category: 'excellent' },
    }

    for (const [label, tripId] of Object.entries(tripsByCategory)) {
      const row = byTrip.get(tripId)
      const exp = expected[label]
      check(`${label} : logistics_score = 100 (30 date + 20 poids, sans trust)`, row?.logistics_score === 100, { row })
      check(`${label} : score = ${100 + exp.bonus} (logistics 100 + bonus ${exp.bonus})`, row?.score === 100 + exp.bonus, {
        row,
      })
      check(`${label} : trust_category = ${exp.category}`, row?.trust_category === exp.category, { row })
    }

    const orderedTripIds = (matches ?? []).map((m) => m.trip_id)
    const expectedOrder = [tripsByCategory.excellent, tripsByCategory.high_trust, tripsByCategory.new_member, tripsByCategory.limited_history]
    check(
      'ordre du tri : excellent > high_trust > new_member > limited_history',
      JSON.stringify(orderedTripIds.slice(0, 4)) === JSON.stringify(expectedOrder),
      { orderedTripIds, expectedOrder }
    )
  }

  // ==========================================================================
  // Scénario 2 : séparation score/logistics_score au seuil de dilution —
  // date parfaite (+30), poids INSUFFISANT (+0), voyageur excellent (+15).
  // score doit franchir 90, logistics_score doit rester en dessous.
  // ==========================================================================
  console.log('\n=== Séparation score/logistics_score au seuil de dilution (poids insuffisant) ===')
  {
    const clientId = await makeUser(`match-client2-${ts}@example.com`, 'LiveTestPass!23')
    cleanup.users.push(clientId)
    const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const { data: req } = await service
      .from('travel_requests')
      .insert({
        client_id: clientId,
        item_description: 'Match test scénario 2 (poids insuffisant)',
        origin_country: 'Belgique',
        destination_city: 'Sfax',
        budget_max: 100,
        needed_by: travelDate,
        item_weight_kg: 20, // le trip n'aura que 5kg dispo → weight_bonus = 0
      })
      .select('id')
      .single()
    cleanup.requests.push(req.id)

    const vExcellent = await makeExcellentProfile(ts, 's2')
    const { data: trip } = await service
      .from('trips')
      .insert({
        voyageur_id: vExcellent,
        origin_country: 'Belgique',
        destination_city: 'Sfax',
        travel_date: travelDate,
        available_weight_kg: 5, // < 20 requis → weight_bonus = 0
        status: 'open',
      })
      .select('id')
      .single()
    cleanup.trips.push(trip.id)

    const { data: matches } = await viewer.rpc('get_trip_matches_for_request', { p_request_id: req.id })
    const row = (matches ?? []).find((m) => m.trip_id === trip.id)

    check('logistics_score = 80 (50 base + 30 date + 0 poids, sans trust)', row?.logistics_score === 80, { row })
    check('score = 95 (logistics 80 + 15 bonus excellent) — franchit 90', row?.score === 95, { row })
    check(
      'le badge "Très bonne correspondance" (seuil 90) ne se déclencherait PAS sur logistics_score malgré score >= 90',
      row?.logistics_score < 90 && row?.score >= 90,
      { row }
    )
  }

  // ==========================================================================
  // Scénario 3 : get_request_matches_for_trip — symétrie côté client
  // (2 catégories suffisent à confirmer le mécanisme, même pattern SQL que
  // le scénario 1).
  // ==========================================================================
  console.log('\n=== get_request_matches_for_trip : bonus côté client (symétrie) ===')
  {
    const voyageurId = await makeUser(`match-voyageur3-${ts}@example.com`, 'LiveTestPass!23')
    cleanup.users.push(voyageurId)
    const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

    const { data: trip } = await service
      .from('trips')
      .insert({
        voyageur_id: voyageurId,
        origin_country: 'Italie',
        destination_city: 'Sousse',
        travel_date: travelDate,
        available_weight_kg: 10,
        status: 'open',
      })
      .select('id')
      .single()
    cleanup.trips.push(trip.id)

    const cNew = await makeNewMemberProfile(ts, 's3')
    const cExcellent = await makeExcellentProfile(ts, 's3')

    const reqsByCategory = {}
    for (const [label, clientId] of [
      ['new_member', cNew],
      ['excellent', cExcellent],
    ]) {
      const { data: req } = await service
        .from('travel_requests')
        .insert({
          client_id: clientId,
          item_description: `Match test scénario 3 (${label})`,
          origin_country: 'Italie',
          destination_city: 'Sousse',
          budget_max: 100,
          needed_by: travelDate,
          item_weight_kg: 5,
        })
        .select('id')
        .single()
      cleanup.requests.push(req.id)
      reqsByCategory[label] = req.id
    }

    const { data: matches, error } = await viewer.rpc('get_request_matches_for_trip', { p_trip_id: trip.id })
    check('get_request_matches_for_trip() ne renvoie pas d\'erreur', !error, { error })

    const byReq = new Map((matches ?? []).map((m) => [m.request_id, m]))
    const rowNew = byReq.get(reqsByCategory.new_member)
    const rowExcellent = byReq.get(reqsByCategory.excellent)

    check('client new_member : score = 105 (100 logistics + 5 bonus)', rowNew?.score === 105, { rowNew })
    check('client excellent : score = 115 (100 logistics + 15 bonus)', rowExcellent?.score === 115, { rowExcellent })
    check('logistics_score identique (100) pour les deux, trust seul les distingue', rowNew?.logistics_score === 100 && rowExcellent?.logistics_score === 100, {
      rowNew,
      rowExcellent,
    })

    const orderedReqIds = (matches ?? []).map((m) => m.request_id)
    check('ordre du tri : excellent avant new_member', orderedReqIds.indexOf(reqsByCategory.excellent) < orderedReqIds.indexOf(reqsByCategory.new_member), {
      orderedReqIds,
    })
  }

  await cleanupAll()

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  await cleanupAll().catch(() => {})
  process.exit(1)
})
