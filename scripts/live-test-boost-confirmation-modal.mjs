// Test en direct (vrai navigateur, Playwright + Chrome système — playwright-core
// est disponible globalement dans cet environnement même sans dépendance
// projet, cf. exploration) de la popup de confirmation après achat boost
// (BoostPayment.tsx). Contrairement aux autres scripts live-test-*.mjs de ce
// repo (fetch HTTP brut, jamais de JS client exécuté), ce chantier exige de
// vérifier un comportement purement client (state React, useEffect, fermeture
// de modal) — un fetch ne peut pas l'observer, un vrai navigateur le peut.
//
// Couvre les 2 points d'usage demandés : une fiche détail (redirectTo
// undefined) et /profil/mes-boosts (redirectTo explicite) — les deux seules
// valeurs distinctes de redirectTo dans le code, donc les deux seuls chemins
// de navigation post-fermeture réellement différents.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from '/Users/amir/node_modules/playwright-core/index.mjs'

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
    full_name: 'Boost Modal Test', phone: '+21600000000', address: '1 rue de test', country: 'TN',
  }).eq('id', data.user.id)
  return data.user.id
}

// Récupère les cookies de session posés par signInWithPassword (via le jar
// Map, même technique que les autres scripts) pour les injecter ensuite
// dans un vrai contexte navigateur Playwright (context.addCookies) — sans
// ça, il faudrait automatiser le vrai formulaire de login, hors sujet ici.
async function getSessionCookies(email, password) {
  const jar = new Map()
  const supabase = createServerClient(SUPABASE_URL, ANON, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (toSet) => toSet.forEach(({ name, value }) => jar.set(name, value)),
    },
  })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return Array.from(jar.entries()).map(([name, value]) => ({ name, value, domain: 'localhost', path: '/' }))
}

const ts = Date.now()
const password = 'LiveTestPass!23'
const cleanup = { users: [], trips: [], payments: [] }

// Petit JPEG minimal valide (1x1) — le formulaire exige juste un fichier
// non vide de type image/*, aucune validation de contenu réelle côté
// serveur (cf. boost-actions.ts : File instanceof + size > 0 seulement).
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
)
const proofPath = '/private/tmp/claude-501/-Users-amir-Desktop-jibli-v2/d1d0473c-e51d-4299-832d-496ac15aeb6c/scratchpad/boost-modal-proof.jpg'
writeFileSync(proofPath, TINY_JPEG)

async function submitBoostAndCheckModal(page, cookies, { gotoUrl, expectSameUrlAfterClose, expectedPath }) {
  const context = page.context()
  await context.addCookies(cookies)
  await page.goto(gotoUrl, { waitUntil: 'networkidle' })

  // Formulaire présent avant soumission.
  const form = page.locator('form', { has: page.locator('input[name="payment_proof"]') }).first()
  await form.locator('input[name="payment_proof"]').setInputFiles(proofPath)

  const modalBefore = page.getByText('Virement envoyé')
  check('popup absente avant soumission', (await modalBefore.count()) === 0, {})

  await form.getByRole('button', { name: 'Confirmer le virement' }).click()

  // La popup doit apparaître après soumission réussie (attend jusqu'à
  // 15s : upload + RPC + revalidatePath côté serveur).
  await modalBefore.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  const modalVisible = await modalBefore.isVisible().catch(() => false)
  check('popup "Virement envoyé" visible après soumission réussie', modalVisible, { gotoUrl })
  if (!modalVisible) return

  const bodyText = await page.getByText('Ta mise en avant est active dès maintenant').isVisible().catch(() => false)
  check('texte de la popup correct', bodyText, {})

  // Fermeture explicite (bouton OK) — puis vérifie que la popup disparaît
  // et que la navigation post-fermeture a bien lieu.
  await page.getByRole('button', { name: 'OK' }).click()
  await modalBefore.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  const modalStillVisible = await modalBefore.isVisible().catch(() => false)
  check('popup fermée après clic sur OK', !modalStillVisible, {})

  await page.waitForLoadState('networkidle')
  const finalUrl = new URL(page.url()).pathname
  check(`navigation post-fermeture vers ${expectedPath}`, finalUrl === expectedPath, { finalUrl, expectedPath })
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })

  // --- Surface 1 : fiche détail (redirectTo undefined) ---
  const voyageur1Id = await makeUser(`boost-modal1-${ts}@example.com`, password)
  cleanup.users.push(voyageur1Id)
  const cookies1 = await getSessionCookies(`boost-modal1-${ts}@example.com`, password)

  const travelDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: trip1 } = await service.from('trips')
    .insert({ voyageur_id: voyageur1Id, origin_country: 'BoostModalFR', destination_city: 'BoostModalTN', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id').single()
  cleanup.trips.push(trip1.id)

  const page1 = await browser.newPage()
  console.log('\n=== Surface 1 : fiche détail /jibli/trips/[id] ===')
  await submitBoostAndCheckModal(page1, cookies1, {
    gotoUrl: `${BASE}/jibli/trips/${trip1.id}`,
    expectedPath: `/jibli/trips/${trip1.id}`,
  })
  await page1.close()

  const { data: paymentsAfter1 } = await service.from('boost_payments').select('id').eq('trip_id', trip1.id)
  check('boost_payments créé pour ce trip (achat réellement effectué)', (paymentsAfter1 ?? []).length === 1, { paymentsAfter1 })
  for (const p of paymentsAfter1 ?? []) cleanup.payments.push(p.id)

  // --- Surface 2 : /profil/mes-boosts (redirectTo explicite) ---
  const voyageur2Id = await makeUser(`boost-modal2-${ts}@example.com`, password)
  cleanup.users.push(voyageur2Id)
  const cookies2 = await getSessionCookies(`boost-modal2-${ts}@example.com`, password)

  const { data: trip2 } = await service.from('trips')
    .insert({ voyageur_id: voyageur2Id, origin_country: 'BoostModalFR2', destination_city: 'BoostModalTN2', travel_date: travelDate, available_weight_kg: 10, status: 'open' })
    .select('id').single()
  cleanup.trips.push(trip2.id)

  const page2 = await browser.newPage()
  console.log('\n=== Surface 2 : /profil/mes-boosts ===')
  await submitBoostAndCheckModal(page2, cookies2, {
    gotoUrl: `${BASE}/profil/mes-boosts`,
    expectedPath: '/profil/mes-boosts',
  })
  await page2.close()

  const { data: paymentsAfter2 } = await service.from('boost_payments').select('id').eq('trip_id', trip2.id)
  check('boost_payments créé pour ce trip (achat réellement effectué)', (paymentsAfter2 ?? []).length === 1, { paymentsAfter2 })
  for (const p of paymentsAfter2 ?? []) cleanup.payments.push(p.id)

  await browser.close()
  console.log(`\n${pass} OK / ${fail} FAIL`)
}

run()
  .catch((e) => { console.error('ERREUR', e); fail++ })
  .finally(async () => {
    try { unlinkSync(proofPath) } catch {}
    for (const id of cleanup.payments) { try { await service.from('boost_payments').delete().eq('id', id) } catch {} }
    for (const id of cleanup.trips) {
      try { await service.from('notifications').delete().eq('related_object_id', id) } catch {}
      try { await service.from('boost_payments').delete().eq('trip_id', id) } catch {}
      try { await service.from('trips').delete().eq('id', id) } catch {}
    }
    for (const id of cleanup.users) { try { await service.auth.admin.deleteUser(id) } catch {} }
    process.exit(fail > 0 ? 1 : 0)
  })
