// Test en direct du commit 2 (portefeuille — dépôt Flouci), couche SQL/RLS.
// Vérifie : pré-insertion directe autorisée (policy assouplie), les deux
// nouvelles RPC (credit_wallet_deposit_flouci/reject_wallet_deposit_flouci)
// inaccessibles à un authenticated normal (revoke), le comportement exact
// de ces RPC en simulant ce que fait la route de callback après une vraie
// vérification Flouci (non testable ici : FLOUCI_APP_TOKEN/SECRET vides
// dans cet environnement, même limite déjà documentée dans lib/flouci.ts —
// la route elle-même est testée séparément dans
// live-test-wallet-deposit-flouci-ts.mjs).
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

async function makeUser(email, password) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: 'Wallet Flouci SQL Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
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
  const clientId = await makeUser(`wallet-flouci-sql-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const client = await signInSession(`wallet-flouci-sql-${ts}@example.com`, password)

  const otherId = await makeUser(`wallet-flouci-sql-other-${ts}@example.com`, password)
  cleanup.users.push(otherId)

  const initialBalance = await getBalance(clientId)

  // 1) Pré-insertion directe (flouci) autorisée — policy assouplie.
  const { data: deposit1, error: insertErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 15, payment_method: 'flouci' })
    .select('id, status')
    .single()
  check('insert direct (flouci, sans preuve) réussit', !insertErr && deposit1?.status === 'awaiting_verification', { insertErr, deposit1 })
  if (deposit1) cleanup.deposits.push(deposit1.id)

  // 2) Un authenticated normal ne peut pas appeler les 2 nouvelles RPC
  //    (revoke from authenticated).
  const { error: creditForbiddenErr } = await client.rpc('credit_wallet_deposit_flouci', {
    p_deposit_id: deposit1.id, p_profile_id: clientId, p_payment_ref: 'should-not-work',
  })
  check('credit_wallet_deposit_flouci refusée à un authenticated normal (revoke)', !!creditForbiddenErr, { creditForbiddenErr })

  const { error: rejectForbiddenErr } = await client.rpc('reject_wallet_deposit_flouci', {
    p_deposit_id: deposit1.id, p_profile_id: clientId,
  })
  check('reject_wallet_deposit_flouci refusée à un authenticated normal (revoke)', !!rejectForbiddenErr, { rejectForbiddenErr })

  // 3) service_role : mauvais profile_id (usurpation) refusé.
  const { error: wrongProfileErr } = await service.rpc('credit_wallet_deposit_flouci', {
    p_deposit_id: deposit1.id, p_profile_id: otherId, p_payment_ref: 'ref-wrong-owner',
  })
  check('credit avec un profile_id qui ne correspond pas au dépôt refusé', !!wrongProfileErr, { wrongProfileErr })
  const balanceAfterWrongProfile = await getBalance(clientId)
  check('solde inchangé après tentative avec le mauvais profil', balanceAfterWrongProfile === initialBalance, { balanceAfterWrongProfile, initialBalance })

  // 4) service_role, bon profil : crédite réellement.
  const { error: creditErr } = await service.rpc('credit_wallet_deposit_flouci', {
    p_deposit_id: deposit1.id, p_profile_id: clientId, p_payment_ref: `ref-${ts}-1`,
  })
  check('credit_wallet_deposit_flouci (service_role, bon profil) réussit', !creditErr, { creditErr })

  const { data: depositAfterCredit } = await service.from('wallet_deposits').select('status, payment_ref').eq('id', deposit1.id).single()
  check('status = credited, payment_ref posé', depositAfterCredit?.status === 'credited' && depositAfterCredit?.payment_ref === `ref-${ts}-1`, { depositAfterCredit })

  const balanceAfterCredit = await getBalance(clientId)
  check('solde crédité exactement du montant (15)', balanceAfterCredit === initialBalance + 15, { balanceAfterCredit, initialBalance })

  // 5) Idempotence : replay sur la même ligne, déjà credited -> no-op.
  const { error: replayErr } = await service.rpc('credit_wallet_deposit_flouci', {
    p_deposit_id: deposit1.id, p_profile_id: clientId, p_payment_ref: `ref-${ts}-1`,
  })
  check('replay sur la même ligne déjà créditée ne renvoie pas d\'erreur (idempotent)', !replayErr, { replayErr })
  const balanceAfterReplay = await getBalance(clientId)
  check('solde inchangé après replay (pas de double crédit)', balanceAfterReplay === initialBalance + 15, { balanceAfterReplay })

  // 6) Anti-rejeu inter-lignes : même payment_ref sur une AUTRE ligne refusé.
  const { data: deposit2 } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 999, payment_method: 'flouci' })
    .select('id').single()
  cleanup.deposits.push(deposit2.id)

  const { error: reuseErr } = await service.rpc('credit_wallet_deposit_flouci', {
    p_deposit_id: deposit2.id, p_profile_id: clientId, p_payment_ref: `ref-${ts}-1`,
  })
  check('réutilisation du même payment_ref sur une autre ligne refusée (contrainte unique)', !!reuseErr && reuseErr.code === '23505', { reuseErr })
  const balanceAfterReuseAttempt = await getBalance(clientId)
  check('solde inchangé après tentative de réutilisation (999 jamais crédité)', balanceAfterReuseAttempt === initialBalance + 15, { balanceAfterReuseAttempt })

  // 7) Rejet : jamais crédité, idempotent lui aussi.
  const { data: deposit3 } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 42, payment_method: 'flouci' })
    .select('id').single()
  cleanup.deposits.push(deposit3.id)

  const { error: rejectErr } = await service.rpc('reject_wallet_deposit_flouci', { p_deposit_id: deposit3.id, p_profile_id: clientId })
  check('reject_wallet_deposit_flouci (service_role, bon profil) réussit', !rejectErr, { rejectErr })
  const { data: deposit3After } = await service.from('wallet_deposits').select('status').eq('id', deposit3.id).single()
  check('status = rejected', deposit3After?.status === 'rejected', { deposit3After })
  const balanceAfterReject = await getBalance(clientId)
  check('solde inchangé après rejet (42 jamais crédité)', balanceAfterReject === initialBalance + 15, { balanceAfterReject })

  // 8) Méthode de paiement incohérente (ligne virement) refusée.
  const { data: virementDeposit } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 5, payment_method: 'virement', payment_proof_url: 'https://example.com/x.jpg' })
    .select('id').single()
  cleanup.deposits.push(virementDeposit.id)

  const { error: wrongMethodErr } = await service.rpc('credit_wallet_deposit_flouci', {
    p_deposit_id: virementDeposit.id, p_profile_id: clientId, p_payment_ref: 'ref-wrong-method',
  })
  check('credit_wallet_deposit_flouci sur une ligne virement refusé', !!wrongMethodErr, { wrongMethodErr })

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.deposits) { try { await service.from('wallet_deposits').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
