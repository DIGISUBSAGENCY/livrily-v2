'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resetPasswordSchema } from '@/lib/validations/auth'

export interface ResetPasswordFormState {
  error: string | null
}

// Même pattern que app/(admin-auth)/admin/reset-password/actions.ts.
// Nécessite une session de récupération déjà établie par /auth/callback
// (échange du `code` reçu par email, cf. son commentaire sur next=
// /reset-password). Sans session valide, updateUser() échoue simplement
// avec une erreur Supabase, reflétée telle quelle.
export async function resetPassword(
  _prevState: ResetPasswordFormState,
  formData: FormData
): Promise<ResetPasswordFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: 'Impossible de mettre à jour le mot de passe, réessaie.' }
  }

  // On repart d'une session propre : l'utilisateur doit se reconnecter avec
  // son nouveau mot de passe plutôt que de rester connecté via la session
  // de récupération (même choix que le flow admin).
  await supabase.auth.signOut()
  redirect('/login?reset=success')
}
