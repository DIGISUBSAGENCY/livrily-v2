'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema } from '@/lib/validations/auth'

export interface ForgotPasswordFormState {
  error: string | null
}

export interface ResendCodeResult {
  error: string | null
  success: boolean
}

// Toujours le même comportement de succès, que l'email corresponde ou non
// à un compte existant — resetPasswordForEmail() de Supabase ne renvoie de
// toute façon pas d'erreur dans ce cas (comportement anti-énumération
// intégré), on ne fait que refléter fidèlement ce que fait déjà GoTrue.
// redirectTo conservé par défense en profondeur (cf. app/(auth)/forgot-
// password/actions.ts) mais /admin/reset-password se vérifie désormais par
// code OTP, pas par ce lien.
//
// Factorisé (appelé par adminForgotPassword ET resendAdminPasswordResetCode)
// — même envoi Supabase, seul le comportement après (redirection vs. rester
// sur place) diffère.
async function sendAdminPasswordResetEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/admin/reset-password`,
  })

  if (error) {
    // Ce n'est PAS le cas "email inconnu" (GoTrue ne renvoie jamais d'erreur
    // pour ça, cf. commentaire au-dessus) — si on arrive ici, c'est un vrai
    // échec serveur (rate limit, redirectTo hors liste blanche, SMTP mal
    // configuré...). Logué en entier côté serveur pour diagnostiquer, sans
    // jamais exposer error.message au client (fuite d'infos internes).
    console.error('[admin/forgot-password] resetPasswordForEmail a échoué', {
      message: error.message,
      status: error.status,
      code: (error as { code?: string }).code,
      name: error.name,
    })
    return { error: "Impossible d'envoyer l'email pour le moment, réessaie." }
  }

  return { error: null }
}

// Redirige directement vers /admin/reset-password (email pré-rempli) au
// lieu d'une page de confirmation intermédiaire.
export async function adminForgotPassword(
  _prevState: ForgotPasswordFormState,
  formData: FormData
): Promise<ForgotPasswordFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Adresse email invalide.' }
  }

  const { error } = await sendAdminPasswordResetEmail(parsed.data.email)
  if (error) return { error }

  redirect(`/admin/reset-password?email=${encodeURIComponent(parsed.data.email)}`)
}

// Renvoi du code depuis /admin/reset-password (bouton "Envoyer" à côté du
// champ code) — même envoi que ci-dessus, sans redirection.
export async function resendAdminPasswordResetCode(email: string): Promise<ResendCodeResult> {
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Adresse email invalide.', success: false }
  }

  const { error } = await sendAdminPasswordResetEmail(parsed.data.email)
  return { error, success: !error }
}
