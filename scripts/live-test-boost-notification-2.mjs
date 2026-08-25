// Test en direct du commit 2 (notifications boost) — "Paiement vérifié".
//
// Limite assumée : verifyBoostPayment() est une Server Action ('use
// server'), qui appelle next/headers::cookies() en interne — non
// exécutable depuis un script Node standalone (hors contexte de requête
// Next.js), et aucun script existant dans ce repo n'invoque une Server
// Action via le protocole HTTP brut (header Next-Action, id de build
// instable) — même verifyTravelPayment, qui a le même mécanisme et existe
// depuis plus longtemps, n'a jamais été testé ainsi. Ce script reproduit
// donc exactement la même séquence que le code de l'action (diff
// actions.ts) contre la vraie base Supabase : update RLS-gated en tant
// qu'admin (policy boost_payments_update_admin_only, déjà éprouvée), puis
// insertion de la notification via create_notification() en tant que
// service_role — exactement le chemin qu'emprunte notifyUser()
// (lib/notifications/create.ts) à l'intérieur de l'action. tsc/lint déjà
// passés sur le fichier réel (cf. commit) : ce script valide la logique de
// données, pas la compilation.
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
    full_name: 'Boost Notif2 Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], payments: [] }

// Reproduit exactement la dérivation de actions.ts (relatedObjectType /
// relatedObjectId à partir des 3 colonnes exclusives de boost_payments).
function deriveRelated(payment) {
  const relatedObjectType = payment.trip_id ? 'trip' : payment.product_offer_id ? 'product_offer' : 'travel_request'
  const relatedObjectId = payment.trip_id ?? payment.product_offer_id ?? payment.request_id
  return { relatedObjectType, relatedObjectId }
}

async function run() {
  const voyageurId = await makeUser(`boost-notif2-voyageur-${ts}@example.com`, password)
  cleanup.users.push(voyageurId)

  const adminId = await makeUser(`boost-notif2-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const admin = await signInSession(`boost-notif2-admin-${ts}@example.com`, password)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: trip } = await service
    .from('trips')
    .insert({ voyageur_id: voyageurId, origin_country: 'BoostNotif2FR', destination_city: 'BoostNotif2TN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id').single()
  cleanup.trips.push(trip.id)

  const { data: payment } = await service
    .from('boost_payments')
    .insert({ voyageur_id: voyageurId, trip_id: trip.id, payment_method: 'virement', payment_proof_url: 'https://example.com/proof.jpg', amount: 3.5, duration_days: 2, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(payment.id)

  // 1) L'update tel que verifyBoostPayment() le fait, sous session admin
  //    réelle (RLS boost_payments_update_admin_only, pas service_role).
  const { data: updated, error: updateErr } = await admin
    .from('boost_payments')
    .update({ status: 'paid', verified_by: adminId, verified_at: new Date().toISOString() })
    .eq('id', payment.id)
    .eq('status', 'awaiting_verification')
    .select('id, voyageur_id, trip_id, product_offer_id, request_id')
    .single()

  check('admin : update boost_payments -> paid réussit (RLS)', !updateErr && updated?.id === payment.id, { updateErr, updated })

  const { relatedObjectType, relatedObjectId } = deriveRelated(updated)
  check('dérivation related_object_type = trip (colonne trip_id renseignée)', relatedObjectType === 'trip', { relatedObjectType })
  check('dérivation related_object_id = id du trip', relatedObjectId === trip.id, { relatedObjectId })

  // 2) La notification, via le même chemin que notifyUser() (RPC
  //    create_notification en service_role — cf. lib/notifications/create.ts).
  const { error: notifErr } = await service.rpc('create_notification', {
    p_user_id: updated.voyageur_id,
    p_type: 'boost_update',
    p_title: 'Paiement vérifié',
    p_body: 'Ton virement pour la mise en avant a été vérifié.',
    p_priority: 'normal',
    p_related_object_type: relatedObjectType,
    p_related_object_id: relatedObjectId,
  })
  check('create_notification() (chemin notifyUser) réussit', !notifErr, { notifErr })

  const { data: notifs } = await service
    .from('notifications')
    .select('type, title, body, related_object_type, related_object_id, user_id')
    .eq('user_id', voyageurId).eq('type', 'boost_update').order('created_at', { ascending: false }).limit(1)
  const notif = notifs?.[0]
  check('notification boost_update présente en base', !!notif, { notif })
  check('titre = "Paiement vérifié"', notif?.title === 'Paiement vérifié', { notif })
  check('related_object_type = trip / related_object_id = id du trip', notif?.related_object_type === 'trip' && notif?.related_object_id === trip.id, { notif })

  // 3) Non-admin : la policy RLS refuse toujours l'update (garde-fou déjà
  //    éprouvé dans live-test-boost-typescript.mjs, re-vérifié ici en
  //    contexte de ce commit précis).
  const otherId = await makeUser(`boost-notif2-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const other = await signInSession(`boost-notif2-other-${ts}@example.com`, password)
  const { data: otherPayment } = await service
    .from('boost_payments')
    .insert({ voyageur_id: voyageurId, trip_id: trip.id, payment_method: 'virement', payment_proof_url: 'https://example.com/proof2.jpg', amount: 2, duration_days: 1, status: 'awaiting_verification' })
    .select('id').single()
  cleanup.payments.push(otherPayment.id)
  const { data: otherUpdate } = await other
    .from('boost_payments')
    .update({ status: 'paid' })
    .eq('id', otherPayment.id)
    .select('id')
  check('non-admin : update refusé (0 ligne affectée, RLS)', (otherUpdate ?? []).length === 0, { otherUpdate })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
    for (const id of cleanup.trips) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
      try { await service.from('trips').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
