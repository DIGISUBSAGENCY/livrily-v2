// Test en direct de la couche TypeScript du commit 1 (portefeuille — dépôt
// virement) : rendu de /parrainage (formulaire + historique), rendu de
// /admin/portefeuille-paiements (liste + preuve signée), lien AdminNav.
// La couche SQL (RLS, contrainte, trigger de crédit) est déjà couverte à
// 16/16 par live-test-wallet-deposit-sql.mjs — pas reproduite ici.
//
// depositWalletVirement() est une Server Action ('use server',
// next/headers::cookies() en interne) — non invocable en HTTP brut depuis
// Node, même limite documentée sur verifyBoostPayment/verifyTravelPayment
// plus tôt dans ce projet. Ce script reproduit donc la séquence exacte de
// l'action (upload storage + insert wallet_deposits) avec la session RÉELLE
// du client (mêmes appels Supabase, même RLS), puis vérifie via de vrais
// GET HTTP que /parrainage et /admin/portefeuille-paiements reflètent
// correctement ce dépôt.
import { readFileSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { createHmac } from 'node:crypto'

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

async function makeUser(email, password, extra) {
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  await service.from('profiles').update({
    full_name: 'Wallet TS Test', phone: '+21600000000', address: '1 rue de test', country: 'TN', ...extra,
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
  const cookieHeader = () => Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { supabase, cookieHeader }
}

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of base32.replace(/=+$/, '').toUpperCase()) {
    const val = alphabet.indexOf(char)
    if (val === -1) continue
    bits += val.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function generateTotp(secretBase32, timeStepSeconds = 30, digits = 6) {
  const key = base32Decode(secretBase32)
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binCode =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff)
  return (binCode % 10 ** digits).toString().padStart(digits, '0')
}
async function enrollAndVerifyTotp(supabase) {
  const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (enrollErr) throw enrollErr
  const code = generateTotp(enrollData.totp.secret)
  const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollData.id, code })
  if (verifyErr) throw verifyErr
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], deposits: [] }

async function run() {
  const clientId = await makeUser(`wallet-ts-client-${ts}@example.com`, password)
  cleanup.users.push(clientId)
  const { supabase: client, cookieHeader: clientCookieFn } = await signInSession(`wallet-ts-client-${ts}@example.com`, password)
  const clientCookie = clientCookieFn()

  const adminId = await makeUser(`wallet-ts-admin-${ts}@example.com`, password, { role: 'admin' })
  cleanup.users.push(adminId)
  const { supabase: admin, cookieHeader: adminCookieFn } = await signInSession(`wallet-ts-admin-${ts}@example.com`, password)
  await enrollAndVerifyTotp(admin)
  const adminCookie = adminCookieFn()

  // ==========================================================================
  // 1. /parrainage : formulaire de dépôt visible, coordonnées bancaires
  //    affichées.
  //
  // Chantier brique 4/N (restructuration en onglets) : le contenu de
  // l'onglet "Portefeuille" n'est rendu dans le DOM réel que si
  // defaultTab='portefeuille' — sinon ?flouci=success force ce défaut côté
  // serveur (ParrainageTabs, cf. page.tsx), même mécanique qu'un vrai
  // retour de paiement Flouci. Sans ce paramètre, un GET nu montre l'onglet
  // "Parrainage" par défaut, où ce formulaire n'existe pas dans le DOM —
  // ATTENTION : le payload RSC (flight data) inliné dans le HTML initial
  // contient quand même le texte des DEUX onglets (nécessaire pour changer
  // d'onglet sans round-trip serveur), donc une simple recherche de TEXTE
  // BRUT (ex: "Déposer", le RIB) matcherait à tort même onglet fermé —
  // seules les recherches sur la SYNTAXE d'attribut HTML réelle
  // (name="...") sont fiables ici, jamais trouvées dans ce payload encodé
  // en JSON (name":"..." avec un deux-points, pas un egal). Vérifié en
  // direct en comparant les deux ce chantier-ci.
  // ==========================================================================
  console.log('\n=== 1. /parrainage — formulaire de dépôt ===')
  const pageBeforeRes = await fetch(`${BASE}/parrainage?flouci=success`, { headers: { cookie: clientCookie } })
  const pageBeforeBody = await pageBeforeRes.text()
  check('GET /parrainage → 200', pageBeforeRes.status === 200, { status: pageBeforeRes.status })
  check('formulaire de dépôt présent (input amount)', pageBeforeBody.includes('name="amount"'), {})
  check('champ preuve de virement présent', pageBeforeBody.includes('name="payment_proof"'), {})
  check('RIB de test affiché', pageBeforeBody.includes('00000000000000000000'), {})
  check('texte obsolète "au checkout" retiré', !pageBeforeBody.includes('au checkout'), {})

  // ==========================================================================
  // 2. Dépôt — reproduit la séquence exacte de depositWalletVirement()
  //    (upload storage + insert) avec la session réelle du client.
  // ==========================================================================
  console.log('\n=== 2. Dépôt (séquence de l\'action, session client réelle) ===')
  const proofBytes = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    'base64'
  )
  const proofPath = `${clientId}/wallet-deposit-${ts}.jpg`
  const { error: uploadErr } = await client.storage
    .from('payment-proofs')
    .upload(proofPath, proofBytes, { contentType: 'image/jpeg', upsert: true })
  check('upload de la preuve (session client) réussit', !uploadErr, { uploadErr })

  const { data: inserted, error: insertErr } = await client
    .from('wallet_deposits')
    .insert({ profile_id: clientId, amount: 42.75, payment_method: 'virement', payment_proof_url: proofPath })
    .select('id, status')
    .single()
  check('insert wallet_deposits (session client) réussit', !insertErr && inserted?.status === 'awaiting_verification', { insertErr, inserted })
  if (inserted) cleanup.deposits.push(inserted.id)

  // ==========================================================================
  // 3. /parrainage reflète le dépôt (historique + badge).
  // ==========================================================================
  console.log('\n=== 3. /parrainage — historique reflète le dépôt ===')
  const pageAfterRes = await fetch(`${BASE}/parrainage?flouci=success`, { headers: { cookie: clientCookie } })
  const pageAfterBody = (await pageAfterRes.text()).replace(/<!--\s*-->/g, '')
  check('montant du dépôt affiché dans l\'historique', pageAfterBody.includes('42.750') || pageAfterBody.includes('42,750') || pageAfterBody.includes('42.75'), {})
  check('badge "En attente de vérification" affiché', pageAfterBody.includes('En attente de vérification'), {})

  // ==========================================================================
  // 4. /admin/portefeuille-paiements : dépôt listé, preuve signée affichée.
  // ==========================================================================
  console.log('\n=== 4. /admin/portefeuille-paiements ===')
  const adminPageRes = await fetch(`${BASE}/admin/portefeuille-paiements`, { headers: { cookie: adminCookie } })
  const adminPageBody = await adminPageRes.text()
  check('GET /admin/portefeuille-paiements (admin) → 200', adminPageRes.status === 200, { status: adminPageRes.status })
  check('dépôt en attente listé (montant)', adminPageBody.includes('42.750') || adminPageBody.includes('42,750'), {})
  check('image de preuve (URL signée) présente', adminPageBody.includes('<img') && adminPageBody.includes('payment-proofs'), {})
  check('boutons Marquer vérifié / Rejeter présents', adminPageBody.includes('Marquer vérifié') && adminPageBody.includes('Rejeter'), {})

  // Non-admin : middleware bloque.
  const nonAdminRes = await fetch(`${BASE}/admin/portefeuille-paiements`, { headers: { cookie: clientCookie }, redirect: 'manual' })
  check('non-admin : redirigé hors de /admin/portefeuille-paiements', [301, 302, 303, 307, 308].includes(nonAdminRes.status), { status: nonAdminRes.status })

  // ==========================================================================
  // 5. Lien AdminNav — vérifié au niveau du fichier source, pas du HTML
  //    rendu : les liens du sous-menu "Paiements" ne sont dans le DOM qu'à
  //    l'ouverture du dropdown ({isOpen && (...)}, état client, fermé par
  //    défaut) — vrai pour TOUS les items du groupe (Paiements Boost,
  //    Retraits...), donc un GET HTML ne peut jamais les y trouver, avec
  //    ou sans ce chantier. Confirmé en vérifiant que "Paiements Boost"
  //    (lien déjà en prod) est absent du même HTML pour la même raison.
  // ==========================================================================
  console.log('\n=== 5. AdminNav (vérification source) ===')
  const navSource = readFileSync('components/layout/AdminNav.tsx', 'utf8')
  const existingLinkAlsoAbsentFromHtml = !adminPageBody.includes('Paiements Boost')
  check('confirmation : un lien de dropdown déjà en prod est bien absent du HTML initial (même mécanisme)', existingLinkAlsoAbsentFromHtml, {})
  check('AdminNav.tsx référence le nouveau lien avec le bon label et le bon href', navSource.includes("{ href: '/admin/portefeuille-paiements', label: 'Dépôts portefeuille' }"), {})

  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    for (const id of cleanup.deposits) { try { await service.from('wallet_deposits').delete().eq('id', id) } catch {} }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
