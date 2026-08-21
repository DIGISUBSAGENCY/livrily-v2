'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema } from '@/lib/validations/auth'
import { getSiteUrl } from '@/lib/site'

export interface ForgotPasswordFormState {
  error: string | null
}

export interface ResendCodeResult {
  error: string | null
  success: boolean
}

// Toujours le même comportement de succès, que l'email corresponde ou non
// à un compte existant — resetPasswordForEmail() ne renvoie de toute façon
// pas d'erreur dans ce cas (anti-énumération). redirectTo est conservé par
// défense en profondeur (si jamais le template email garde un lien en plus
// du code — cf. resetPasswordSchema) mais n'est plus le chemin principal :
// /reset-password se vérifie désormais par code OTP, entré manuellement,
// immunisé contre le click-tracking qui pré-consommait le lien.
//
// Factorisé (appelé par requestPasswordReset ET resendPasswordResetCode) :
// les deux déclenchent le même envoi Supabase, seul le comportement après
// (redirection vs. rester sur place) diffère.
async function sendPasswordResetEmail(email: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const siteUrl = getSiteUrl()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  })

  if (error) {
    // Pas le cas "email inconnu" (GoTrue ne renvoie jamais d'erreur pour
    // ça) — un vrai échec serveur si on arrive ici (rate limit, redirectTo
    // hors liste blanche, SMTP...). Logué en entier côté serveur, jamais
    // exposé au client.
    console.error('[forgot-password] resetPasswordForEmail a échoué', {
      message: error.message,
      status: error.status,
      code: (error as { code?: string }).code,
      name: error.name,
    })
    return { error: "Impossible d'envoyer l'email pour le moment, réessaie." }
  }

  return { error: null }
}

// Redirige directement vers /reset-password (email pré-rempli) au lieu
// d'une page de confirmation intermédiaire — l'utilisateur a déjà l'email
// ouvert dans un autre onglet, autant lui économiser un clic.
export async function requestPasswordReset(
  _prevState: ForgotPasswordFormState,
  formData: FormData
): Promise<ForgotPasswordFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Adresse email invalide.' }
  }

  const { error } = await sendPasswordResetEmail(parsed.data.email)
  if (error) return { error }

  redirect(`/reset-password?email=${encodeURIComponent(parsed.data.email)}`)
}

// Renvoi du code depuis /reset-password (bouton "Envoyer" à côté du champ
// code) — même envoi que ci-dessus, mais sans redirection : on reste sur
// place, l'utilisateur n'a pas à retaper son mot de passe déjà saisi.
export async function resendPasswordResetCode(email: string): Promise<ResendCodeResult> {
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Adresse email invalide.', success: false }
  }

  const { error } = await sendPasswordResetEmail(parsed.data.email)
  return { error, success: !error }
}
