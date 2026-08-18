'use server'

import { createClient } from '@/lib/supabase/server'
import { forgotPasswordSchema } from '@/lib/validations/auth'

export interface ForgotPasswordFormState {
  error: string | null
  success: boolean
  email?: string
}

// Toujours le même message de succès, que l'email corresponde ou non à un
// compte existant — resetPasswordForEmail() ne renvoie de toute façon pas
// d'erreur dans ce cas (anti-énumération). redirectTo est conservé par
// défense en profondeur (si jamais le template email garde un lien en plus
// du code — cf. resetPasswordSchema) mais n'est plus le chemin principal :
// /reset-password se vérifie désormais par code OTP, entré manuellement,
// immunisé contre le click-tracking qui pré-consommait le lien.
export async function requestPasswordReset(
  _prevState: ForgotPasswordFormState,
  formData: FormData
): Promise<ForgotPasswordFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Adresse email invalide.', success: false }
  }

  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
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
    return { error: "Impossible d'envoyer l'email pour le moment, réessaie.", success: false }
  }

  return { error: null, success: true, email: parsed.data.email }
}
