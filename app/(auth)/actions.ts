'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { signInSchema, signUpSchema } from '@/lib/validations/auth'
import type { UserRole } from '@/types/database'

export interface AuthFormState {
  error: string | null
}

function roleHome(role: UserRole): string {
  if (role === 'commerce') return '/commerce'
  if (role === 'admin') return '/admin'
  return '/'
}

export async function signIn(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
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
    .select('role, full_name, phone, address, country, is_active')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    return { error: 'Impossible de récupérer ton profil. Réessaie ou contacte le support.' }
  }

  if (!profile.is_active) {
    await supabase.auth.signOut()
    return { error: 'Ce compte a été désactivé. Contacte le support Livrily.' }
  }

  // Même condition que /auth/callback (flux Google/confirmation email) : ne
  // vérifiait auparavant que full_name, ce qui laissait passer un compte
  // créé par mot de passe sans jamais lui demander téléphone/adresse/pays.
  const profileComplete = Boolean(profile.full_name && profile.phone && profile.address && profile.country)

  revalidatePath('/', 'layout')
  redirect(profileComplete ? roleHome(profile.role) : '/profil/completer')
}

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

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
