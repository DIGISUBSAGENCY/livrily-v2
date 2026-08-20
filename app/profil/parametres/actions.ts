'use server'

import { createClient } from '@/lib/supabase/server'
import { changePasswordSchema } from '@/lib/validations/auth'

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
