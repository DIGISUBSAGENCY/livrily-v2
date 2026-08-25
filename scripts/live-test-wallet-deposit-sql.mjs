// Test en direct du commit 1 (SQL) du chantier portefeuille — dépôt par
// virement. Vérifie : insert direct client (RLS), refus des inserts hors
// périmètre (status forcé, payment_method forcé, profile_id forcé,
// contrainte preuve obligatoire), refus d'update par un non-admin,
// vérification admin → solde crédité, rejet → jamais crédité, et
// idempotence du trigger (re-passer credited→credited ne recrédite pas).
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
    full_name: 'Wallet Deposit Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
const cleanup = { users: [], deposits: [] }

async function run() {
  const clientId = await makeUser(`wallet-dep-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const client = await signInSession(`wallet-dep-client-${ts}@example.com`, password)

  const otherId = await makeUser(`wallet-dep-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)
  const other = await signInSession(`wallet-dep-other-${ts}@example.com`, password)

  const adminId = await makeUser(`wallet-dep-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const admin = await signInSession(`wallet-dep-admin-${ts}@example.com`, password)

  const initialBalance = await getBalance(clientId)
  check('solde initial du client = 0', initialBalance === 0, { initialBalance })

  // 1) Insert direct valide (virement, awaiting_verification implicite).
  const { data: deposit1, error: insertErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 25.5, payment_method: 'virement', payment_proof_url: 'https://example.com/proof1.jpg' })
    .select('id, status')
    .single()
  check('insert direct (virement, preuve fournie) réussit', !insertErr && deposit1?.status === 'awaiting_verification', { insertErr, deposit1 })
  if (deposit1) cleanup.deposits.push(deposit1.id)

  const balanceAfterInsert = await getBalance(clientId)
  check('solde inchangé après soumission (pas encore vérifié)', balanceAfterInsert === 0, { balanceAfterInsert })

  // 2) Insert hors périmètre : status forcé côté client, doit échouer.
  const { error: statusErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 10, payment_method: 'virement', payment_proof_url: 'https://example.com/x.jpg', status: 'credited' })
  check('insert direct avec status=credited refusé (RLS)', !!statusErr, { statusErr })

  // 3) Insert hors périmètre : payment_method=flouci, doit échouer (réservé
  //    à la RPC de la brique 2/N).
  const { error: methodErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 10, payment_method: 'flouci', payment_ref: 'flouci-123' })
  check('insert direct avec payment_method=flouci refusé (RLS)', !!methodErr, { methodErr })

  // 4) Insert pour le profil d'un AUTRE utilisateur, doit échouer.
  const { error: otherProfileErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: otherId, amount: 10, payment_method: 'virement', payment_proof_url: 'https://example.com/x.jpg' })
  check('insert direct pour un autre profil refusé (RLS)', !!otherProfileErr, { otherProfileErr })

  // 5) Virement sans preuve, doit échouer (contrainte
  //    wallet_deposits_virement_has_proof).
  const { error: noProofErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 10, payment_method: 'virement' })
  check('insert virement sans preuve refusé (contrainte CHECK)', !!noProofErr, { noProofErr })

  // 6) Non-admin ne peut pas mettre à jour (ni le sien, ni celui d'un
  //    autre) — écriture réservée à l'admin.
  const { data: selfUpdate } = await client
    .from('wallet_deposits')
    .update({ status: 'credited' })
    .eq('id', deposit1.id)
    .select('id')
  check('client ne peut pas s\'auto-vérifier (0 ligne affectée, RLS)', (selfUpdate ?? []).length === 0, { selfUpdate })

  const balanceAfterSelfAttempt = await getBalance(clientId)
  check('solde toujours inchangé après tentative d\'auto-vérification', balanceAfterSelfAttempt === 0, { balanceAfterSelfAttempt })

  // 7) Admin vérifie → crédité, solde augmente exactement du montant.
  const { data: verified, error: verifyErr } = await admin
    .from('wallet_deposits')
    .update({ status: 'credited', verified_by: adminId, verified_at: new Date().toISOString() })
    .eq('id', deposit1.id)
    .eq('status', 'awaiting_verification')
    .select('status')
    .single()
  check('admin : vérification réussit', !verifyErr && verified?.status === 'credited', { verifyErr, verified })

  const balanceAfterCredit = await getBalance(clientId)
  check('solde crédité exactement du montant (25.5)', balanceAfterCredit === 25.5, { balanceAfterCredit })

  // 8) Idempotence : re-passer credited -> credited ne recrédite pas.
  await admin.from('wallet_deposits').update({ status: 'credited' }).eq('id', deposit1.id)
  const balanceAfterNoOp = await getBalance(clientId)
  check('re-transition credited→credited ne recrédite pas (idempotence)', balanceAfterNoOp === 25.5, { balanceAfterNoOp })

  // 9) Deuxième dépôt, rejeté par l'admin → jamais crédité.
  const { data: deposit2 } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 100, payment_method: 'virement', payment_proof_url: 'https://example.com/proof2.jpg' })
    .select('id').single()
  cleanup.deposits.push(deposit2.id)

  const { data: rejected, error: rejectErr } = await admin
    .from('wallet_deposits')
    .update({ status: 'rejected', verified_by: adminId, verified_at: new Date().toISOString() })
    .eq('id', deposit2.id)
    .eq('status', 'awaiting_verification')
    .select('status')
    .single()
  check('admin : rejet réussit', !rejectErr && rejected?.status === 'rejected', { rejectErr, rejected })

  const balanceAfterReject = await getBalance(clientId)
  check('solde inchangé après rejet (jamais crédité)', balanceAfterReject === 25.5, { balanceAfterReject })

  // 10) Lecture : le client voit ses propres dépôts, pas ceux d'un autre.
  const { data: ownDeposits } = await client.from('wallet_deposits').select('id').eq('profile_id', clientId)
  check('client voit ses propres dépôts', (ownDeposits ?? []).length === 2, { count: ownDeposits?.length })

  const { data: otherSeesNothing } = await other.from('wallet_deposits').select('id').eq('profile_id', clientId)
  check('un autre client ne voit pas les dépôts du client (RLS select)', (otherSeesNothing ?? []).length === 0, { otherSeesNothing })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.deposits) { try { await service.from('wallet_deposits').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
