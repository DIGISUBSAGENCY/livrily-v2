// Test en direct du chantier séparation Parrainage/Portefeuille : le
// Portefeuille (solde, dépôt, retrait, historiques) a déménagé de
// /parrainage vers /jibli/dashboard (nouvelle section, pas un onglet — le
// Dashboard n'en a pas). Vérifie : /parrainage redevient une page simple
// (aucun contenu Portefeuille, aucune trace de l'ancienne structure en
// onglets), /jibli/dashboard porte bien la section Portefeuille complète,
// et le solde ne s'affiche plus DU TOUT sur /parrainage (séparation
// complète demandée, pas un rappel en lecture seule).
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
    full_name: 'Wallet Move Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', wallet_balance: 42.5,
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
  return Array.from(jar.entries()).map(([n, v]) => `${n}=${v}`).join('; ')
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [] }

async function run() {
  const clientId = await makeUser(`wallet-move-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const clientCookie = await signInSession(`wallet-move-${ts}@example.com`, password)

  // ==========================================================================
  // 1. /parrainage : page simple, aucun contenu Portefeuille, solde absent
  //    (attributs HTML réels — pas de texte brut, qui pourrait leaker via
  //    un éventuel payload RSC comme documenté dans les autres scripts de
  //    ce chantier).
  // ==========================================================================
  console.log('\n=== 1. /parrainage — page simple, sans Portefeuille ===')
  const parrainageRes = await fetch(`${BASE}/parrainage`, { headers: { cookie: clientCookie } })
  const parrainageBody = await parrainageRes.text()
  check('GET /parrainage → 200', parrainageRes.status === 200, { status: parrainageRes.status })
  check('titre "Parrainage" (pas "Parrainage & portefeuille")', parrainageBody.includes('>Parrainage<') && !parrainageBody.includes('Parrainage &amp; portefeuille') && !parrainageBody.includes('Parrainage & portefeuille'), {})
  check('formulaire de dépôt absent (name="amount")', !parrainageBody.includes('name="amount"'), {})
  check('formulaire de retrait absent (id="withdrawal_amount")', !parrainageBody.includes('id="withdrawal_amount"'), {})
  check('montant du solde (42.500) absent — séparation complète, pas de rappel', !parrainageBody.includes('42.500') && !parrainageBody.includes('42,500'), {})
  check('aucun bouton d\'onglet "Portefeuille" (structure à onglets retirée)', !parrainageBody.includes('>Portefeuille<'), {})

  // ==========================================================================
  // 2. /jibli/dashboard : section Portefeuille complète (solde, formulaires,
  //    coordonnées bancaires).
  // ==========================================================================
  console.log('\n=== 2. /jibli/dashboard — section Portefeuille ===')
  const dashboardRes = await fetch(`${BASE}/jibli/dashboard`, { headers: { cookie: clientCookie } })
  const dashboardBody = await dashboardRes.text()
  check('GET /jibli/dashboard → 200', dashboardRes.status === 200, { status: dashboardRes.status })
  check('titre de section "Portefeuille" présent', dashboardBody.includes('>Portefeuille<'), {})
  check('solde (42.500) affiché', dashboardBody.includes('42.500') || dashboardBody.includes('42,500'), {})
  check('formulaire de dépôt présent (name="amount")', dashboardBody.includes('name="amount"'), {})
  check('formulaire de retrait présent (id="withdrawal_amount")', dashboardBody.includes('id="withdrawal_amount"'), {})
  check('RIB de test affiché', dashboardBody.includes('00000000000000000000'), {})

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
