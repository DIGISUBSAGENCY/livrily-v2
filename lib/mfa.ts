// Helpers partagés autour de supabase.auth.mfa — appelés depuis les Server
// Actions de /admin/2fa (enrôlement forcé admin), /admin/2fa/verifier
// (step-up d'une session déjà aal1 avec facteur vérifié) et
// /profil/parametres (activation/désactivation optionnelle client/voyageur).
// Un seul flow TOTP dans tout le projet : Supabase Auth le propose déjà
// nativement (vérifié en direct — enroll() réussit sans configuration
// dashboard), contrairement au facteur 'phone' natif (désactivé, testé) et
// à lib/twilio.ts (jamais testé, échoue silencieusement par conception —
// disqualifiant pour un canal de sécurité).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface MfaEnrollResult {
  error: string | null
  factorId?: string
  // qr_code de Supabase est du SVG brut, pas encore une data URI (cf. doc
  // supabase-js : "prepend data:image/svg+xml;utf-8," avant de l'utiliser
  // dans un <img src>) — déjà converti ici pour ne pas le répéter dans
  // chaque composant appelant.
  qrCodeDataUri?: string
  secret?: string
}

export async function enrollTotpFactor(supabase: SupabaseClient<Database>): Promise<MfaEnrollResult> {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })

  if (error) {
    console.error('[mfa] enroll a échoué', { message: error.message, code: error.code })
    return { error: "Impossible de démarrer l'activation, réessaie." }
  }

  return {
    error: null,
    factorId: data.id,
    qrCodeDataUri: `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`,
    secret: data.totp.secret,
  }
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
