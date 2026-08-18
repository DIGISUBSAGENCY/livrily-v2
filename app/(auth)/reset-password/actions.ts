'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resetPasswordSchema } from '@/lib/validations/auth'

export interface ResetPasswordFormState {
  error: string | null
}

// Vérifie le code OTP à 6 chiffres reçu par email (verifyOtp établit lui-
// même la session — aucun passage par /auth/callback nécessaire, contrai-
// rement à l'ancien flux par lien), puis définit le nouveau mot de passe
// dans la foulée. Un Server Action peut écrire les cookies de session
// directement (contrairement à un Route Handler qui construit sa propre
// NextResponse.redirect() — cf. le correctif historique sur /auth/callback),
// donc verifyOtp() + updateUser() fonctionnent l'un après l'autre sans
// complexité de relais de cookies.
export async function resetPassword(
  _prevState: ResetPasswordFormState,
  formData: FormData
): Promise<ResetPasswordFormState> {
  const parsed = resetPasswordSchema.safeParse({
    email: formData.get('email'),
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()

  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'recovery',
  })
  if (verifyError) {
    return { error: 'Code invalide ou expiré. Redemande un email si besoin.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (updateError) {
    return { error: 'Impossible de mettre à jour le mot de passe, réessaie.' }
  }

  // On repart d'une session propre : l'utilisateur doit se reconnecter avec
  // son nouveau mot de passe plutôt que de rester connecté via la session
  // de récupération.
  await supabase.auth.signOut()
  redirect('/login?reset=success')
}
