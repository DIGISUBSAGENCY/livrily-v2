'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { changePasswordSchema } from '@/lib/validations/auth'
import { enrollTotpFactor, verifyTotpFactor, unenrollTotpFactor, type MfaEnrollResult } from '@/lib/mfa'

export interface ChangePasswordFormState {
  error: string | null
  success: boolean
}

// Re-vérifie l'ancien mot de passe via signInWithPassword() avant
// d'autoriser le changement (cf. lib/validations/auth.ts) — updateUser()
// seul ne l'exige pas, mais une session laissée ouverte sur un appareil
// partagé suffirait sinon seule à changer le mot de passe.
export async function changePassword(
  _prev: ChangePasswordFormState,
  formData: FormData
): Promise<ChangePasswordFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { error: 'Session expirée, reconnecte-toi.', success: false }
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', success: false }
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  })
  if (verifyError) {
    return { error: 'Mot de passe actuel incorrect.', success: false }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.newPassword })
  if (updateError) {
    return { error: 'Impossible de mettre à jour le mot de passe, réessaie.', success: false }
  }

  return { error: null, success: true }
}

export interface ResendResult {
  error: string | null
  success: boolean
}

// CTA "M'envoyer le lien de vérification" du stepper Email→Identité
// (components/account/VerificationStepper.tsx) — protégé par le même
// cooldown 60s que le renvoi de code mot de passe (useResendCooldown),
// même raison : éviter le spam/abus sur l'endpoint d'envoi.
export async function resendEmailConfirmation(): Promise<ResendResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { error: 'Session expirée, reconnecte-toi.', success: false }
  }

  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
  if (error) {
    return { error: "Impossible d'envoyer l'email, réessaie plus tard.", success: false }
  }

  return { error: null, success: true }
}

export interface DeactivateAccountResult {
  error: string | null
}

// Sans champ de formulaire à lire (juste un bouton de confirmation), donc
// pas de useFormState ici — même forme que resendEmailConfirmation
// ci-dessus, appelée directement via useTransition côté client
// (DangerZone.tsx). Désactivation réversible (is_active=false), pas une
// suppression réelle — décision explicite (destructif + irréversible mis
// de côté pour un chantier séparé si voulu). Même garde-fou déjà en place
// côté signIn() (cf. app/(auth)/actions.ts : un compte is_active=false est
// déconnecté et rejeté à la prochaine tentative de connexion) — un admin
// peut réactiver depuis /admin/utilisateurs/[id] (UserStatusToggle), rien
// n'est perdu.
export async function deactivateAccount(): Promise<DeactivateAccountResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Session expirée, reconnecte-toi.' }
  }

  const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', user.id)
  if (error) {
    return { error: 'Impossible de désactiver le compte, réessaie.' }
  }

  await supabase.auth.signOut()
  redirect('/')
}

export interface RevokeSessionResult {
  error: string | null
}

// Déconnexion à distance d'une autre session (components/account/
// ConnectedSessions.tsx). La vérification de propriété (auth.uid() =
// user_id de la session ciblée) est faite CÔTÉ BASE par revoke_my_session()
// (SECURITY DEFINER, cf. supabase/schema.sql) — jamais uniquement côté
// application, exactement pour ce genre d'action où une erreur laisserait
// un utilisateur déconnecter la session d'un autre. Vérifié en direct
// (compte de test à 2 sessions + compte tiers) avant ce commit.
export async function revokeSession(sessionId: string): Promise<RevokeSessionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Session expirée, reconnecte-toi.' }
  }

  const { error } = await supabase.rpc('revoke_my_session', { p_session_id: sessionId })
  if (error) {
    return { error: 'Impossible de déconnecter cet appareil, réessaie.' }
  }

  return { error: null }
}

// Activation optionnelle (client/voyageur) — même helpers que le flow
// admin forcé (app/(admin-auth)/admin/2fa/actions.ts), cf. lib/mfa.ts. Pas
// de redirect() ici, contrairement au flow admin : reste sur place,
// router.refresh() côté MfaSetupForm suffit à rafraîchir l'état affiché.
export async function enrollMfaFactor(): Promise<MfaEnrollResult> {
  const supabase = await createClient()
  return enrollTotpFactor(supabase)
}

export async function verifyMfaEnrollment(factorId: string, code: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const result = await verifyTotpFactor(supabase, factorId, code)
  if (!result.error) revalidatePath('/profil/parametres')
  return result
}

export interface DisableMfaResult {
  error: string | null
}

// Désactivation en libre-service — bloquée côté serveur pour un compte
// admin (2FA obligatoire pour ce rôle, cf. garde-fou middleware), pas
// seulement masquée côté UI : même si le bouton était affiché par erreur,
// cette vérification reste la vraie frontière. Un admin qui perd son
// appareil passe par la procédure de récupération (désenrôlement par un
// autre admin via l'API service_role), pas par cette action.
export async function disableMfaFactor(factorId: string): Promise<DisableMfaResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée, reconnecte-toi.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') {
    return { error: 'La double authentification est obligatoire pour les comptes administrateur.' }
  }

  const result = await unenrollTotpFactor(supabase, factorId)
  if (!result.error) revalidatePath('/profil/parametres')
  return result
}
