'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resetPasswordSchema } from '@/lib/validations/auth'

export interface ResetPasswordFormState {
  error: string | null
}

// Même pattern que app/(auth)/reset-password/actions.ts (code OTP plutôt
// que lien — cf. resetPasswordSchema pour le contexte). Différence
// importante par rapport à avant : cette page n'est plus protégée en amont
// par le middleware (elle doit rester accessible sans session, cf.
// lib/supabase/middleware.ts), donc la vérification "ce compte est bien un
// admin" doit se faire ICI, explicitement, après verifyOtp() — sans quoi
// n'importe quel compte (client/commerce) pourrait techniquement utiliser
// cette page pour redéfinir son mot de passe via le flux admin.
export async function adminResetPassword(
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

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'recovery',
  })
  if (verifyError || !verifyData.user) {
    return { error: 'Code invalide ou expiré. Redemande un email si besoin.' }
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', verifyData.user.id).single()

  if (profile?.role !== 'admin') {
    await supabase.auth.signOut()
    return { error: "Accès refusé — ce compte n'a pas les droits administrateur." }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (updateError) {
    return { error: 'Impossible de mettre à jour le mot de passe, réessaie.' }
  }

  // On repart d'une session propre : l'admin doit se reconnecter avec son
  // nouveau mot de passe plutôt que de rester connecté via la session de
  // récupération.
  await supabase.auth.signOut()
  redirect('/admin/login?reset=success')
}
