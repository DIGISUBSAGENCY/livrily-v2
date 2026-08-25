// Test en direct du commit 3 (portefeuille — retrait) — couche SQL/RLS.
// Vérifie : demande -> solde débité immédiatement (RPC request_wallet_
// withdrawal, verrou FOR UPDATE), refus si montant > solde ou <= 0, rejet
// admin -> recrédité (trigger refund_wallet_balance_on_withdrawal_reject),
// paiement admin -> pas de changement de solde (déjà débité), retrait
// partiel autorisé (contrairement à withdrawal_requests), RLS (non-admin ne
// peut pas mettre à jour), idempotence du recredit sur rejet répété.
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
    full_name: 'Wallet Withdrawal Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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

async function getBalance(profileId) {
  const { data } = await service.from('profiles').select('wallet_balance').eq('id', profileId).single()
  return data?.wallet_balance
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], withdrawals: [] }

async function run() {
  const clientId = await makeUser(`wallet-wd-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const client = await signInSession(`wallet-wd-client-${ts}@example.com`, password)

  const otherId = await makeUser(`wallet-wd-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const other = await signInSession(`wallet-wd-other-${ts}@example.com`, password)

  const adminId = await makeUser(`wallet-wd-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const admin = await signInSession(`wallet-wd-admin-${ts}@example.com`, password)

  // Crédite un solde de départ (simule un dépôt déjà vérifié — pas l'objet
  // de ce test, écrit directement en service_role).
  await service.from('profiles').update({ wallet_balance: 100 }).eq('id', clientId)
  const initialBalance = await getBalance(clientId)
  check('solde de départ = 100', initialBalance === 100, { initialBalance })

  // 1) Montant invalide (<=0) refusé.
  const { error: zeroErr } = await client.rpc('request_wallet_withdrawal', { p_amount: 0 })
  check('retrait de 0 refusé', !!zeroErr, { zeroErr })
  const { error: negErr } = await client.rpc('request_wallet_withdrawal', { p_amount: -5 })
  check('retrait négatif refusé', !!negErr, { negErr })

  // 2) Montant > solde refusé, solde inchangé.
  const { error: tooMuchErr } = await client.rpc('request_wallet_withdrawal', { p_amount: 1000 })
  check('retrait supérieur au solde refusé', !!tooMuchErr, { tooMuchErr })
  const balanceAfterTooMuch = await getBalance(clientId)
  check('solde inchangé après tentative refusée', balanceAfterTooMuch === 100, { balanceAfterTooMuch })

  // 3) Retrait partiel (30 sur 100) — débité immédiatement.
  const { data: withdrawal1Id, error: reqErr } = await client.rpc('request_wallet_withdrawal', { p_amount: 30 })
  check('demande de retrait partiel (30) réussit', !reqErr && !!withdrawal1Id, { reqErr, withdrawal1Id })
  if (withdrawal1Id) cleanup.withdrawals.push(withdrawal1Id)

  const balanceAfterRequest = await getBalance(clientId)
  check('solde débité immédiatement (100 -> 70)', balanceAfterRequest === 70, { balanceAfterRequest })

  const { data: withdrawal1 } = await service.from('wallet_withdrawals').select('*').eq('id', withdrawal1Id).single()
  check('ligne wallet_withdrawals créée, status=pending, amount=30', withdrawal1?.status === 'pending' && withdrawal1?.amount === 30, { withdrawal1 })

  // 4) Non-admin (ni propriétaire ni admin) ne peut pas mettre à jour.
  const { data: otherUpdate } = await other.from('wallet_withdrawals').update({ status: 'paid' }).eq('id', withdrawal1Id).select('id')
  check('un autre utilisateur ne peut pas modifier la demande (0 ligne, RLS)', (otherUpdate ?? []).length === 0, { otherUpdate })

  // 5) Le propriétaire lui-même ne peut pas non plus (update admin-only).
  const { data: selfUpdate } = await client.from('wallet_withdrawals').update({ status: 'paid' }).eq('id', withdrawal1Id).select('id')
  check('le demandeur lui-même ne peut pas s\'auto-valider (0 ligne, RLS)', (selfUpdate ?? []).length === 0, { selfUpdate })

  // 6) Admin rejette -> recrédité.
  const { data: rejected, error: rejectErr } = await admin
    .from('wallet_withdrawals')
    .update({ status: 'rejected', processed_by: adminId, processed_at: new Date().toISOString() })
    .eq('id', withdrawal1Id)
    .eq('status', 'pending')
    .select('status')
    .single()
  check('admin : rejet réussit', !rejectErr && rejected?.status === 'rejected', { rejectErr, rejected })

  const balanceAfterReject = await getBalance(clientId)
  check('solde recrédité après rejet (70 -> 100)', balanceAfterReject === 100, { balanceAfterReject })

  // 7) Idempotence : re-rejeter la même ligne (déjà rejected) ne recrédite
  //    pas une seconde fois (bypass volontaire du .eq('status','pending')
  //    pour tester le trigger lui-même, pas seulement le garde-fou de la
  //    Server Action).
  await admin.from('wallet_withdrawals').update({ status: 'rejected' }).eq('id', withdrawal1Id)
  const balanceAfterReRejectAttempt = await getBalance(clientId)
  check('re-rejet sur une ligne déjà rejected ne recrédite pas (idempotence trigger)', balanceAfterReRejectAttempt === 100, { balanceAfterReRejectAttempt })

  // 8) Nouveau retrait, admin marque payé -> aucun changement de solde
  //    (déjà débité à la demande).
  const { data: withdrawal2Id } = await client.rpc('request_wallet_withdrawal', { p_amount: 20 })
  cleanup.withdrawals.push(withdrawal2Id)
  const balanceAfterSecondRequest = await getBalance(clientId)
  check('solde débité pour le 2e retrait (100 -> 80)', balanceAfterSecondRequest === 80, { balanceAfterSecondRequest })

  const { data: paid, error: paidErr } = await admin
    .from('wallet_withdrawals')
    .update({ status: 'paid', processed_by: adminId, processed_at: new Date().toISOString() })
    .eq('id', withdrawal2Id)
    .eq('status', 'pending')
    .select('status')
    .single()
  check('admin : paiement réussit', !paidErr && paid?.status === 'paid', { paidErr, paid })

  const balanceAfterPaid = await getBalance(clientId)
  check('solde inchangé après paiement (déjà débité à la demande)', balanceAfterPaid === 80, { balanceAfterPaid })

  // 9) Lecture : le client voit ses propres retraits, pas ceux d'un autre.
  const { data: ownWithdrawals } = await client.from('wallet_withdrawals').select('id').eq('profile_id', clientId)
  check('client voit ses propres retraits (2)', (ownWithdrawals ?? []).length === 2, { count: ownWithdrawals?.length })

  const { data: otherSeesNothing } = await other.from('wallet_withdrawals').select('id').eq('profile_id', clientId)
  check('un autre client ne voit pas les retraits du client (RLS select)', (otherSeesNothing ?? []).length === 0, { otherSeesNothing })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.withdrawals) { try { await service.from('wallet_withdrawals').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
