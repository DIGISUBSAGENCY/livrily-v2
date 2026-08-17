'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { signInSchema } from '@/lib/validations/auth'

export interface AdminAuthFormState {
  error: string | null
}

// Connexion admin dédiée : email/mot de passe uniquement, jamais Google OAuth
// (contrairement à /login). Le rôle est vérifié ICI, explicitement, plutôt
// que de compter sur le middleware — sans ça, un mot de passe correct mais un
// compte non-admin obtiendrait quand même une session authentifiée (juste
// rebalancée vers "/" par le middleware au prochain accès à /admin), ce qui
// n'est pas ce qu'on veut pour un formulaire qui doit refuser explicitement
// l'accès et ne jamais laisser de cookie de session actif derrière lui.
export async function adminSignIn(
  _prevState: AdminAuthFormState,
  formData: FormData
): Promise<AdminAuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: 'Email ou mot de passe incorrect.' }
  }
  if (!data.user) {
    return { error: 'Connexion impossible, réessaie.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    // Mot de passe valide mais compte non-admin : on ne laisse aucune session
    // active derrière un refus explicite.
    await supabase.auth.signOut()
    return { error: 'Accès refusé — ce compte n\'a pas les droits administrateur.' }
  }

  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { error: 'Ce compte administrateur a été désactivé.' }
  }

  const next = String(formData.get('next') ?? '').trim()

  revalidatePath('/', 'layout')
  redirect(next.startsWith('/admin') ? next : '/admin')
}
