// Tests en direct du Trust System (Phase 3, brique 3/N) contre la vraie DB
// Supabase (un seul environnement, cf. CLAUDE.md) — mêmes conventions que
// scripts/smoke-test-admin-rendering.mjs (service_role pour bâtir/nettoyer
// les fixtures, vraies sessions @supabase/ssr pour les vérifications RLS/
// grants, nettoyage systématique en fin de scénario).
//
// Usage : node scripts/live-test-trust-system.mjs
// (aucun serveur dev requis — appelle directement les RPC Postgres via
// PostgREST, pas de rendu de page ici)
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient, createClient as createAnonClient } from '@supabase/supabase-js'
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

const cleanupIds = { users: [], requests: [] }

// Fait vivre une mission jusqu'à 'completed' + paiement 'released' en
// passant par le VRAI chemin (RPC accept_travel_proposal/
// confirm_travel_receipt + transitions directes autorisées par
// enforce_travel_request_transitions pour le voyageur accepté) — pas
// d'écriture directe de service_role sur travel_requests.status, qui est
// bloquée par ce trigger (aucun auth.uid() sous service_role, donc aucune
// des 3 branches client/voyageur/admin ne matche). Découvert en debug live
// pendant ce chantier : un update direct service_role a échoué avec "Non
// autorisé à modifier cette demande."
// payment_method='flouci' : évite l'étape de vérification admin du
// virement (statut passe direct à 'escrowed'), simplifie la fixture sans
// changer ce qui est mesuré (has_released_payment ne dépend pas de la
// méthode).
async function completeTravelMission(clientSupabase, voyageurSupabase, clientId, voyageurId) {
  const ts = Date.now() + Math.random()
  const { data: req, error: reqErr } = await clientSupabase
    .from('travel_requests')
    .insert({
      client_id: clientId,
      item_description: `Trust test mission ${ts}`,
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
    p_payment_ref: `trust-test-ref-${ts}`,
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

// ============================================================================
// Bâtit un ensemble de profils fixtures représentant les scénarios à tester,
// et un "viewer" séparé (authentifié, aucun lien avec les profils testés) —
// c'est LUI qui appelle les RPC pour chaque assertion, exactement le chemin
// réel : un utilisateur consultant le profil d'un AUTRE utilisateur.
// ============================================================================
async function setup() {
  const ts = Date.now()
  const password = 'LiveTestPass!23'

  const viewerId = await makeUser(`trust-viewer-${ts}@example.com`, password)
  const { supabase: viewer } = await signInSession(`trust-viewer-${ts}@example.com`, password)
  cleanupIds.users.push(viewerId)

  // --- Profil A : nouveau, aucune donnée ---
  const profileNewId = await makeUser(`trust-new-${ts}@example.com`, password)
  cleanupIds.users.push(profileNewId)

  // --- Profil B : identité vérifiée uniquement ---
  const profileVerifiedId = await makeUser(`trust-verified-${ts}@example.com`, password)
  cleanupIds.users.push(profileVerifiedId)
  await service.from('identity_verifications').insert({
    profile_id: profileVerifiedId,
    status: 'approved',
    id_document_url: 'fixtures/fake-id.jpg',
    selfie_url: 'fixtures/fake-selfie.jpg',
  })

  // --- Profil C : expérimenté (identité vérifiée, avis 5/5, 3 missions
  //     complétées comme client, 5 comme voyageur, paiement libéré,
  //     ancienneté 13 mois) — combinaison choisie pour dépasser 100 en
  //     théorique (15+10+15+10+5=55 au-dessus de la base 50) et vérifier
  //     le plafond dur à 99, et pour franchir le seuil top_traveler
  //     (>=5 missions voyageur) en plus de trusted_traveler. ---
  const profileExpId = await makeUser(`trust-exp-${ts}@example.com`, password)
  cleanupIds.users.push(profileExpId)
  const otherId = await makeUser(`trust-exp-other-${ts}@example.com`, password)
  cleanupIds.users.push(otherId)
  const { supabase: expSession } = await signInSession(`trust-exp-${ts}@example.com`, password)
  const { supabase: otherSession } = await signInSession(`trust-exp-other-${ts}@example.com`, password)

  await service.from('identity_verifications').insert({
    profile_id: profileExpId,
    status: 'approved',
    id_document_url: 'fixtures/fake-id.jpg',
    selfie_url: 'fixtures/fake-selfie.jpg',
  })

  // Ancienneté fixée à 13 mois (le compte vient d'être créé à l'instant) —
  // plafonne à elle seule le bonus ancienneté (floor(13/3)*2=8, capé à 5).
  await service
    .from('profiles')
    .update({ created_at: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString() })
    .eq('id', profileExpId)

  // 3 missions complétées comme CLIENT (profileExp client, other voyageur)
  // via le vrai chemin RPC — la 2e libère aussi le paiement, testant
  // has_released_payment en conditions réelles.
  const expClientRequestIds = []
  for (let i = 0; i < 3; i++) {
    const reqId = await completeTravelMission(expSession, otherSession, profileExpId, otherId)
    expClientRequestIds.push(reqId)
    cleanupIds.requests.push(reqId)
  }

  // 5 missions complétées comme VOYAGEUR (other client, profileExp
  // voyageur) — nécessaire pour franchir le seuil top_traveler (>=5).
  for (let i = 0; i < 5; i++) {
    const voyageurReqId = await completeTravelMission(otherSession, expSession, otherId, profileExpId)
    cleanupIds.requests.push(voyageurReqId)
  }

  // Avis double sens sur la 1ère mission client, révélation immédiate
  // (les deux existent) — note 5/5 dans les deux sens.
  await service.from('travel_reviews').insert([
    {
      travel_request_id: expClientRequestIds[0],
      reviewer_id: otherId,
      reviewee_id: profileExpId,
      direction: 'voyageur_to_client',
      rating: 5,
    },
    {
      travel_request_id: expClientRequestIds[0],
      reviewer_id: profileExpId,
      reviewee_id: otherId,
      direction: 'client_to_voyageur',
      rating: 5,
    },
  ])

  // --- Profil D : litigieux (5 litiges, aucune autre donnée positive) ---
  const profileDisputedId = await makeUser(`trust-disputed-${ts}@example.com`, password)
  cleanupIds.users.push(profileDisputedId)
  for (let i = 0; i < 5; i++) {
    const { data: req } = await service
      .from('travel_requests')
      .insert({
        client_id: profileDisputedId,
        item_description: `Trust test disputed ${i}`,
        origin_country: 'France',
        destination_city: 'Tunis',
        budget_max: 50,
      })
      .select('id')
      .single()
    await service
      .from('disputes')
      .insert({ travel_request_id: req.id, opened_by: profileDisputedId, reason: 'Trust test dispute', status: 'open' })
    cleanupIds.requests.push(req.id)
  }

  return { viewer, profileNewId, profileVerifiedId, profileExpId, profileDisputedId }
}

async function cleanup() {
  for (const reqId of cleanupIds.requests) {
    await service.from('disputes').delete().eq('travel_request_id', reqId)
    await service.from('travel_payments').delete().eq('request_id', reqId)
    await service.from('travel_reviews').delete().eq('travel_request_id', reqId)
    await service.from('travel_proposals').delete().eq('request_id', reqId)
    await service.from('travel_requests').delete().eq('id', reqId)
  }
  for (const userId of cleanupIds.users) {
    await service.from('identity_verifications').delete().eq('profile_id', userId)
    await service.auth.admin.deleteUser(userId)
  }
}

async function run() {
  const { viewer, profileNewId, profileVerifiedId, profileExpId, profileDisputedId } = await setup()

  // ==========================================================================
  // Scénario 1 : profil neuf — aucun avis, aucune transaction
  // ==========================================================================
  console.log('\n=== Profil neuf (aucune donnée) ===')
  {
    const { data, error } = await viewer.rpc('get_trust_score', { p_profile_id: profileNewId })
    const row = data?.[0]
    check('get_trust_score() ne renvoie pas d\'erreur', !error, { error })
    check('score = 50 (base, aucun signal, NULL avis → 0 contribution)', row?.score === 50, { row })
    check('category = new_member', row?.category === 'new_member', { row })

    const { data: badges, error: badgesErr } = await viewer.rpc('get_trust_badges', { p_profile_id: profileNewId })
    check('get_trust_badges() ne renvoie pas d\'erreur', !badgesErr, { error: badgesErr })
    check('aucun badge pour un profil neuf', (badges ?? []).length === 0, { badges })
  }

  // ==========================================================================
  // Scénario 2 : identité vérifiée uniquement
  // ==========================================================================
  console.log('\n=== Profil identité vérifiée uniquement ===')
  {
    const { data, error } = await viewer.rpc('get_trust_score', { p_profile_id: profileVerifiedId })
    const row = data?.[0]
    check('get_trust_score() ne renvoie pas d\'erreur', !error, { error })
    check('score = 65 (50 base + 15 identité, ancre du document confirmée)', row?.score === 65, { row })
    check('category = new_member (65 < 70)', row?.category === 'new_member', { row })

    const { data: badges } = await viewer.rpc('get_trust_badges', { p_profile_id: profileVerifiedId })
    check('badge identity_verified présent, seul', (badges ?? []).map((b) => b.badge).join(',') === 'identity_verified', {
      badges,
    })
  }

  // ==========================================================================
  // Scénario 3 : profil expérimenté — plafond dur à 99
  // Décomposition attendue : 50 base + 15 identité + 10 avis (5/5) + 15
  // volume (8 missions complétées, plafonné) + 10 ratio complétion client
  // (3/3) + 5 ancienneté (13 mois, plafonné) = 105 théorique → 99 après
  // plafond.
  // ==========================================================================
  console.log('\n=== Profil expérimenté (score brut théorique 105, plafonné à 99) ===')
  {
    const { data, error } = await viewer.rpc('get_trust_score', { p_profile_id: profileExpId })
    const row = data?.[0]
    check('get_trust_score() ne renvoie pas d\'erreur', !error, { error })
    check('score = 99 (jamais 100 automatique malgré un total théorique > 100)', row?.score === 99, { row })
    check('category = excellent', row?.category === 'excellent', { row })

    const { data: badges } = await viewer.rpc('get_trust_badges', { p_profile_id: profileExpId })
    const badgeNames = (badges ?? []).map((b) => b.badge).sort()
    const expected = ['identity_verified', 'payment_verified', 'reliable_sender', 'top_traveler', 'trusted_traveler'].sort()
    check(
      'badges = identity_verified, payment_verified, reliable_sender, top_traveler, trusted_traveler (5 missions voyageur ≥ seuil top_traveler)',
      JSON.stringify(badgeNames) === JSON.stringify(expected),
      { badgeNames }
    )
  }

  // ==========================================================================
  // Scénario 4 : profil litigieux — pénalité plafonnée à -20
  // ==========================================================================
  console.log('\n=== Profil litigieux (5 litiges, pénalité théorique -40 plafonnée à -20) ===')
  {
    const { data, error } = await viewer.rpc('get_trust_score', { p_profile_id: profileDisputedId })
    const row = data?.[0]
    check('get_trust_score() ne renvoie pas d\'erreur', !error, { error })
    check('score = 30 (50 base - 20 pénalité plafonnée)', row?.score === 30, { row })
    check('category = limited_history', row?.category === 'limited_history', { row })
    check('score >= 0 (jamais négatif)', row?.score >= 0, { row })

    const { data: badges } = await viewer.rpc('get_trust_badges', { p_profile_id: profileDisputedId })
    check('aucun badge pour un profil litigieux sans signal positif', (badges ?? []).length === 0, { badges })
  }

  // ==========================================================================
  // Scénario 5 : grants — anon ne peut pas appeler get_trust_score/badges
  // ==========================================================================
  console.log('\n=== Grants : rôle anon (non authentifié) ===')
  {
    const anon = createAnonClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: scoreErr } = await anon.rpc('get_trust_score', { p_profile_id: profileNewId })
    check('get_trust_score() refusé pour anon (permission denied)', !!scoreErr, { scoreErr })

    const { error: badgesErr } = await anon.rpc('get_trust_badges', { p_profile_id: profileNewId })
    check('get_trust_badges() refusé pour anon (permission denied)', !!badgesErr, { badgesErr })
  }

  // ==========================================================================
  // Scénario 6 : compute_trust_signals() n'est PAS appelable directement,
  // même par un utilisateur authentifié (fonction interne uniquement)
  // ==========================================================================
  console.log('\n=== Sécurité : compute_trust_signals() verrouillée (interne uniquement) ===')
  {
    const { error } = await viewer.rpc('compute_trust_signals', { p_profile_id: profileNewId })
    check('compute_trust_signals() refusé pour authenticated (permission denied)', !!error, { error })
  }

  await cleanup()

  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} FAIL ===`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(async (err) => {
  console.error('Erreur inattendue, nettoyage best-effort puis abandon :', err)
  await cleanup().catch(() => {})
  process.exit(1)
})
