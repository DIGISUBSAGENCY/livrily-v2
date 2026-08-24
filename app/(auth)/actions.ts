'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { signUpSchema } from '@/lib/validations/auth'
import { getSiteUrl } from '@/lib/site'

export interface AuthFormState {
  error: string | null
}

// signIn() (email/mot de passe côté client) a été retirée d'ici : la
// connexion tourne maintenant 100% côté navigateur (components/auth/
// LoginForm.tsx, createBrowserClient) pour que auth.sessions.ip/user_agent
// reflètent le vrai appareil de l'utilisateur — nécessaire pour "Appareils
// connectés" (list_my_sessions/revoke_my_session). /admin/login, le 2FA
// admin, les flux de récupération de mot de passe et signUp() ci-dessous
// restent des Server Actions inchangées, aucun autre chemin de connexion
// n'est concerné par ce chantier.

export async function signUp(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const siteUrl = getSiteUrl()

  // Code de parrainage optionnel : transmis en métadonnée, résolu en
  // referred_by par le trigger handle_new_user() (schema.sql) — jamais
  // vérifié ici, un code invalide/inexistant est silencieusement ignoré
  // côté trigger plutôt que de bloquer l'inscription.
  const referralCode = String(formData.get('referral_code') ?? '').trim()

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: referralCode ? { referral_code_used: referralCode } : undefined,
    },
  })

  if (error) {
    // Même angle mort que resetPasswordForEmail avant son propre fix : la
    // vraie erreur (ex: "Error sending confirmation email" côté SMTP, cf.
    // diagnostic du bug signup) était jusqu'ici totalement avalée. Loguée
    // en entier côté serveur, jamais exposée au client (fuite d'infos
    // internes).
    console.error('[signup] auth.signUp a échoué', {
      message: error.message,
      status: error.status,
      code: error.code,
      name: error.name,
    })
    const message =
      error.code === 'user_already_exists'
        ? 'Un compte existe déjà avec cet email.'
        : 'Impossible de créer le compte, réessaie.'
    return { error: message }
  }

  redirect(`/signup/verification-envoyee?email=${encodeURIComponent(parsed.data.email)}`)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
