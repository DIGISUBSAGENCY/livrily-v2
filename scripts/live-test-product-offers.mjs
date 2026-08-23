// Tests en direct de "Offres" (product_offers, take_product_offer(),
// is_client_of_matched_offer()) — mêmes conventions que les scripts
// précédents de cette session (service_role pour les fixtures, vraies
// sessions @supabase/ssr pour les appels RPC/RLS, nettoyage systématique).
//
// Usage : node scripts/live-test-product-offers.mjs
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

const cleanup = { users: [], requests: [], offers: [] }

async function makeOffer(voyageurId, overrides = {}) {
  const ts = Date.now() + Math.random()
  const { data: offer, error } = await service
    .from('product_offers')
    .insert({
      voyageur_id: voyageurId,
      item_description: `Offre test ${ts}`,
      origin_country: 'France',
      destination_city: 'Tunis',
      travel_date: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      item_price: 1000,
      delivery_fee: 200,
      ...overrides,
    })
    .select('id')
    .single()
  if (error) throw new Error(`insert product_offers: ${error.message}`)
  cleanup.offers.push(offer.id)
  return offer.id
}

async function cleanupAll() {
  for (const reqId of cleanup.requests) {
    await service.from('travel_payments').delete().eq('request_id', reqId)
    await service.from('travel_proposals').delete().eq('request_id', reqId)
    await service.from('travel_requests').delete().eq('id', reqId)
  }
  for (const offerId of cleanup.offers) {
    await service.from('product_offers').delete().eq('id', offerId)
  }
  for (const userId of cleanup.users) {
    await service.auth.admin.deleteUser(userId)
  }
}

async function run() {
  const ts = Date.now()
  const password = 'LiveTestPass!23'

  const voyageurAId = await makeUser(`offer-voyageur-a-${ts}@example.com`, password)
  cleanup.users.push(voyageurAId)
  const { supabase: voyageurA } = await signInSession(`offer-voyageur-a-${ts}@example.com`, password)

  const clientBId = await makeUser(`offer-client-b-${ts}@example.com`, password)
  cleanup.users.push(clientBId)
  const { supabase: clientB } = await signInSession(`offer-client-b-${ts}@example.com`, password)

  const clientCId = await makeUser(`offer-client-c-${ts}@example.com`, password)
  cleanup.users.push(clientCId)
  const { supabase: clientC } = await signInSession(`offer-client-c-${ts}@example.com`, password)

  // ==========================================================================
  // Scénario 1 : flow complet — take_product_offer() → accept_travel_proposal()
  // → flip open->matched → is_client_of_matched_offer() (client voit,
  // tiers ne voit pas).
  // ==========================================================================
  console.log('\n=== Scénario 1 : flow complet (take → accept → visibilité) ===')
  {
    const offerId = await makeOffer(voyageurAId)

    const { data: takeResult, error: takeErr } = await clientB.rpc('take_product_offer', { p_offer_id: offerId })
    check('take_product_offer() ne renvoie pas d\'erreur', !takeErr, { error: takeErr })
    const row = takeResult?.[0]
    check('take_product_offer() renvoie request_id + proposal_id', !!row?.request_id && !!row?.proposal_id, { row })

    if (row) {
      cleanup.requests.push(row.request_id)

      const { data: offerAfterTake } = await service.from('product_offers').select('*').eq('id', offerId).single()
      check('offre passée à \'matched\' immédiatement (avant même accept_travel_proposal)', offerAfterTake?.status === 'matched', {
        offerAfterTake,
      })
      check('matched_proposal_id posé', offerAfterTake?.matched_proposal_id === row.proposal_id, { offerAfterTake })

      const { data: req } = await service.from('travel_requests').select('*').eq('id', row.request_id).single()
      check('travel_requests créée avec client_id = clientB', req?.client_id === clientBId, { req })
      check('budget_max = item_price + delivery_fee (1200)', Number(req?.budget_max) === 1200, { req })
      check('needed_by = travel_date de l\'offre', !!req?.needed_by, { req })

      const { data: prop } = await service.from('travel_proposals').select('*').eq('id', row.proposal_id).single()
      check('travel_proposals créée avec voyageur_id = voyageurA', prop?.voyageur_id === voyageurAId, { prop })
      check('item_price/delivery_fee copiés (1000/200)', Number(prop?.item_price) === 1000 && Number(prop?.delivery_fee) === 200, {
        prop,
      })
      check('source_offer_id = offerId', prop?.source_offer_id === offerId, { prop })
      check('status = pending (pas encore accepté)', prop?.status === 'pending', { prop })

      // Avant accept_travel_proposal() : is_client_of_matched_offer() doit
      // encore renvoyer false (accepted_proposal_id pas encore posé sur la
      // demande) — clientC (tiers) ne doit RIEN voir non plus.
      const { data: beforeAcceptB } = await clientB.from('product_offers').select('*').eq('id', offerId).maybeSingle()
      check(
        'AVANT accept : clientB (a pris l\'offre mais pas encore payé) ne la voit pas encore (accepted_proposal_id pas posé)',
        beforeAcceptB === null,
        { beforeAcceptB }
      )

      const { error: acceptErr } = await clientB.rpc('accept_travel_proposal', {
        p_proposal_id: row.proposal_id,
        p_payment_method: 'flouci',
        p_payment_proof_url: null,
        p_payment_ref: `offer-test-ref-${ts}`,
      })
      check('accept_travel_proposal() ne renvoie pas d\'erreur (réutilisation du flow existant)', !acceptErr, { error: acceptErr })

      const { data: reqAfterAccept } = await service.from('travel_requests').select('*').eq('id', row.request_id).single()
      check('travel_requests.status = matched, accepted_proposal_id posé', reqAfterAccept?.status === 'matched' && reqAfterAccept?.accepted_proposal_id === row.proposal_id, {
        reqAfterAccept,
      })

      const { data: payment } = await service.from('travel_payments').select('*').eq('request_id', row.request_id).single()
      check('travel_payments créé, status = escrowed (flouci)', payment?.status === 'escrowed', { payment })

      // APRÈS accept : clientB doit maintenant voir l'offre (matched, lui
      // en est le client) ; clientC (tiers non impliqué) ne doit RIEN voir.
      const { data: afterAcceptB } = await clientB.from('product_offers').select('*').eq('id', offerId).maybeSingle()
      check('APRÈS accept : clientB voit l\'offre (is_client_of_matched_offer)', afterAcceptB?.id === offerId, { afterAcceptB })

      const { data: afterAcceptC } = await clientC.from('product_offers').select('*').eq('id', offerId).maybeSingle()
      check('APRÈS accept : clientC (tiers) ne voit PAS l\'offre', afterAcceptC === null, { afterAcceptC })

      // voyageurA (propriétaire) doit toujours la voir aussi (voyageur_id = auth.uid()).
      const { data: voyageurSees } = await voyageurA.from('product_offers').select('*').eq('id', offerId).maybeSingle()
      check('voyageurA (propriétaire) voit toujours son offre', voyageurSees?.id === offerId, { voyageurSees })
    }
  }

  // ==========================================================================
  // Scénario 2 : auto-prise interdite
  // ==========================================================================
  console.log('\n=== Scénario 2 : impossible de prendre sa propre offre ===')
  {
    const offerId = await makeOffer(voyageurAId)
    const { error } = await voyageurA.rpc('take_product_offer', { p_offer_id: offerId })
    check('take_product_offer() sur sa propre offre échoue', !!error, { error })
    check('message d\'erreur explicite', (error?.message ?? '').includes('propre offre'), { error })

    const { data: offerAfter } = await service.from('product_offers').select('status').eq('id', offerId).single()
    check('offre reste \'open\' après tentative d\'auto-prise', offerAfter?.status === 'open', { offerAfter })
  }

  // ==========================================================================
  // Scénario 3 : verrouillage anti-double-vente — deux prises simultanées,
  // une seule doit réussir.
  // ==========================================================================
  console.log('\n=== Scénario 3 : verrouillage anti-double-vente (prise concurrente) ===')
  {
    const voyageurA2Id = await makeUser(`offer-voyageur-a2-${ts}@example.com`, password)
    cleanup.users.push(voyageurA2Id)
    const clientXId = await makeUser(`offer-client-x-${ts}@example.com`, password)
    cleanup.users.push(clientXId)
    const clientYId = await makeUser(`offer-client-y-${ts}@example.com`, password)
    cleanup.users.push(clientYId)
    const { supabase: clientX } = await signInSession(`offer-client-x-${ts}@example.com`, password)
    const { supabase: clientY } = await signInSession(`offer-client-y-${ts}@example.com`, password)

    const offerId = await makeOffer(voyageurA2Id)

    const [resultX, resultY] = await Promise.all([
      clientX.rpc('take_product_offer', { p_offer_id: offerId }),
      clientY.rpc('take_product_offer', { p_offer_id: offerId }),
    ])

    const succeeded = [resultX, resultY].filter((r) => !r.error)
    const failed = [resultX, resultY].filter((r) => !!r.error)

    check('exactement UNE des deux prises simultanées réussit', succeeded.length === 1, {
      resultX: { error: resultX.error, data: resultX.data },
      resultY: { error: resultY.error, data: resultY.data },
    })
    check('exactement UNE échoue avec \'plus disponible\'', failed.length === 1 && (failed[0]?.error?.message ?? '').includes('plus disponible'), {
      failed: failed.map((f) => f.error),
    })

    if (succeeded[0]?.data?.[0]?.request_id) {
      cleanup.requests.push(succeeded[0].data[0].request_id)
    }

    // Vérifie qu'il n'existe bien qu'UNE SEULE travel_requests liée à cette
    // offre (pas de double création malgré la course).
    const { data: linkedProposals } = await service.from('travel_proposals').select('id').eq('source_offer_id', offerId)
    check('une seule travel_proposals liée à source_offer_id (pas de doublon)', (linkedProposals ?? []).length === 1, {
      linkedProposals,
    })
  }

  // ==========================================================================
  // Scénario 4 : grants — anon ne peut pas appeler take_product_offer(),
  // mais peut lire les offres 'open' (RLS publique) sans erreur de
  // permission sur is_client_of_matched_offer() en arrière-plan.
  // ==========================================================================
  console.log('\n=== Scénario 4 : grants (anon) ===')
  {
    const offerId = await makeOffer(voyageurAId)
    const anon = createAnonClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })

    const { error: takeErr } = await anon.rpc('take_product_offer', { p_offer_id: offerId })
    check('take_product_offer() refusé pour anon (permission denied)', !!takeErr, { takeErr })

    const { data: openOffer, error: selectErr } = await anon.from('product_offers').select('id').eq('id', offerId).maybeSingle()
    check(
      'anon peut lire une offre \'open\' (RLS publique, is_client_of_matched_offer() ne casse pas l\'évaluation pour anon)',
      !selectErr && openOffer?.id === offerId,
      { selectErr, openOffer }
    )
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
