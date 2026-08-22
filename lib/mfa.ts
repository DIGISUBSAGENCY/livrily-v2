// Helpers partagés autour de supabase.auth.mfa — appelés depuis les Server
// Actions de /admin/2fa (enrôlement forcé admin), /admin/2fa/verifier
// (step-up d'une session déjà aal1 avec facteur vérifié) et
// /profil/parametres (activation/désactivation optionnelle client/voyageur).
// Un seul flow TOTP dans tout le projet : Supabase Auth le propose déjà
// nativement (vérifié en direct — enroll() réussit sans configuration
// dashboard), contrairement au facteur 'phone' natif (désactivé, testé) et
// à lib/twilio.ts (jamais testé, échoue silencieusement par conception —
// disqualifiant pour un canal de sécurité).
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Client service_role construit ici (pas réutilisé depuis
// lib/supabase/server.ts::createAdminClient()) : ce fichier expose ses
// fonctions à un script Node autonome (scripts/smoke-test-admin-rendering.mjs,
// import direct hors du runtime Next.js, type-stripping natif de Node) —
// lib/supabase/server.ts importe next/headers, qui ne se résout pas du tout
// hors du runtime Next (vérifié : `Cannot find module '.../next/headers'`).
// Garder lib/mfa.ts indépendant de next/headers préserve cette testabilité.
function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface MfaEnrollResult {
  error: string | null
  factorId?: string
  // data.totp.qr_code renvoyé par supabase-js@2.112.3 est déjà une data URI
  // COMPLÈTE ("data:image/svg+xml;utf-8,<svg...>"), pas du SVG brut — vérifié
  // en direct (enroll() réel, inspection de la valeur). Le préfixer une 2e
  // fois puis encodeURIComponent() l'intégralité (comme le suggère une doc
  // Supabase visiblement obsolète) produisait une data URI dont le contenu
  // SVG décodé était le TEXTE littéral "data:image/svg+xml;utf-8,<?xml...",
  // pas du XML valide — image cassée dans <img>, silencieuse (aucune erreur
  // JS, aucun problème CSP : juste un SVG invalide). Le secret texte en
  // fallback fonctionnait car indépendant. Utilisé tel quel ci-dessous.
  qrCodeDataUri?: string
  secret?: string
}

function toEnrollResult(data: { id: string; totp: { qr_code: string; secret: string } }): MfaEnrollResult {
  return {
    error: null,
    factorId: data.id,
    qrCodeDataUri: data.totp.qr_code,
    secret: data.totp.secret,
  }
}

// MfaSetupForm (composant client de /admin/2fa) appelle cette action sans
// condition à chaque montage — donc à chaque chargement/rechargement de la
// page. Si une tentative précédente n'a jamais été vérifiée (page rechargée
// avant d'entrer le code, onglet fermé...), un facteur TOTP NON-vérifié
// traîne pour cet utilisateur. Supabase attribue toujours le même nom par
// défaut (chaîne vide) à un nouveau facteur totp, donc un 2e enroll() est
// rejeté par l'API : mfa_factor_name_conflict (422, "A factor with the
// friendly name "" for this user already exists"). Reproduit en direct sur
// /admin/2fa en prod — bloquant, car le middleware exige un 2FA vérifié sur
// tout /admin/*, sans mécanisme de récupération côté utilisateur.
// supabase.auth.mfa.listFactors() (session utilisateur normale) ne renvoie
// QUE les facteurs déjà vérifiés — vérifié en direct — impossible de
// détecter/nettoyer ce facteur fantôme sans l'API admin (service_role).
export async function enrollTotpFactor(supabase: SupabaseClient<Database>): Promise<MfaEnrollResult> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })

  if (error) {
    if (error.code === 'mfa_factor_name_conflict') {
      const retried = await enrollAfterClearingOrphanFactors(supabase)
      if (retried) return retried
    }
    console.error('[mfa] enroll a échoué', { message: error.message, code: error.code })
    return { error: "Impossible de démarrer l'activation, réessaie." }
  }

  return toEnrollResult(data)
}

// Nettoie les facteurs TOTP non-vérifiés de l'utilisateur courant puis
// retente enroll() UNE SEULE fois (pas de boucle : si ça échoue encore
// après nettoyage, autre chose ne va pas — pas la peine d'insister en
// silence). Renvoie null si le nettoyage ou la 2e tentative échoue, pour
// laisser l'appelant retomber sur le message d'erreur générique existant.
async function enrollAfterClearingOrphanFactors(supabase: SupabaseClient<Database>): Promise<MfaEnrollResult | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: factorsData, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId: user.id })
  if (listErr) {
    console.error('[mfa] nettoyage facteur fantôme — listFactors a échoué', { message: listErr.message })
    return null
  }

  const orphanFactors = (factorsData?.factors ?? []).filter((factor) => factor.status !== 'verified')
  if (orphanFactors.length === 0) {
    // Conflit pour une autre raison qu'un facteur fantôme (ex: facteur déjà
    // vérifié avec ce nom, cas qui ne devrait pas arriver ici mais pas à
    // nous de le deviner) — rien à nettoyer, pas de retry.
    return null
  }

  for (const factor of orphanFactors) {
    const { error: deleteErr } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id })
    if (deleteErr) {
      console.error('[mfa] nettoyage facteur fantôme — deleteFactor a échoué', {
        factorId: factor.id,
        message: deleteErr.message,
      })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error) {
    console.error('[mfa] enroll a échoué après nettoyage du facteur fantôme', { message: error.message, code: error.code })
    return null
  }

  return toEnrollResult(data)
}

export interface MfaVerifyResult {
  error: string | null
}

// Même appel pour les deux usages : vérifier un facteur fraîchement
// enrôlé (challengeAndVerify juste après enroll()) et le step-up d'une
// session existante avec un facteur déjà vérifié (login, cf. middleware) —
// Supabase ne distingue pas les deux côté API, uniquement par le contexte
// d'appel.
export async function verifyTotpFactor(
  supabase: SupabaseClient<Database>,
  factorId: string,
  code: string
): Promise<MfaVerifyResult> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })

  if (error) {
    return { error: 'Code invalide ou expiré, réessaie.' }
  }

  return { error: null }
}

export interface MfaStatus {
  hasVerifiedFactor: boolean
  factorId: string | null
}

export async function getMfaStatus(supabase: SupabaseClient<Database>): Promise<MfaStatus> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data || data.totp.length === 0) {
    return { hasVerifiedFactor: false, factorId: null }
  }
  return { hasVerifiedFactor: true, factorId: data.totp[0].id }
}

export interface MfaUnenrollResult {
  error: string | null
}

export async function unenrollTotpFactor(supabase: SupabaseClient<Database>, factorId: string): Promise<MfaUnenrollResult> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    console.error('[mfa] unenroll a échoué', { message: error.message, code: error.code })
    return { error: 'Impossible de désactiver la double authentification, réessaie.' }
  }
  return { error: null }
}
