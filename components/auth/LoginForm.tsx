'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { signInSchema } from '@/lib/validations/auth'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import { AuthDivider } from '@/components/auth/AuthDivider'
import type { UserRole } from '@/types/database'

function roleHome(role: UserRole): string {
  if (role === 'admin') return '/admin'
  return '/'
}

// Connexion 100% côté navigateur (createClient() de lib/supabase/client.ts,
// déjà createBrowserClient de @supabase/ssr) — remplace l'ancienne Server
// Action signIn() (supprimée, cf. app/(auth)/actions.ts). Seule cette page
// est concernée : /admin/login, le 2FA admin, les flux de récupération de
// mot de passe et le bouton Google restent inchangés, aucun autre chemin de
// connexion n'y touche.
//
// Pourquoi : auth.sessions.ip/user_agent n'enregistraient jusqu'ici que
// l'IP/user-agent du serveur Vercel (signInWithPassword() tournait dans une
// Server Action), jamais ceux du vrai navigateur — bloquant pour
// "Appareils connectés" (list_my_sessions/revoke_my_session, déjà prêtes
// côté SQL, jamais branchées faute d'un vrai chemin de login client).
// Vérifié empiriquement (pas supposé) que createBrowserClient pose des
// cookies que le middleware/SSR de cette app lit correctement — première
// utilisation de ce pattern dans cette codebase, cf. scripts/
// live-test-client-login.mjs.
//
// is_active n'est vérifié qu'une fois, ici, comme avant — pas de
// régression : middleware.ts ne réapplique ce contrôle qu'aux routes
// /admin/* (isAdminRoute), jamais aux routes client, donc ce comportement
// est identique à celui de l'ancienne Server Action, ligne pour ligne.
export function LoginForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const parsed = signInSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.')
      return
    }

    startTransition(async () => {
      const supabase = createClient()
      const { data, error: signInError } = await supabase.auth.signInWithPassword(parsed.data)

      if (signInError) {
        setError('Email ou mot de passe incorrect.')
        return
      }
      if (!data.user) {
        setError('Connexion impossible, réessaie.')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, full_name, phone, address, country, is_active')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        setError('Impossible de récupérer ton profil. Réessaie ou contacte le support.')
        return
      }

      if (!profile.is_active) {
        await supabase.auth.signOut()
        setError('Ce compte a été désactivé. Contacte le support Livrily.')
        return
      }

      const profileComplete = Boolean(profile.full_name && profile.phone && profile.address && profile.country)
      const destination = profileComplete ? roleHome(profile.role) : '/profil/completer'

      router.push(destination)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <GoogleSignInButton label="Se connecter avec Google" />
      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required hasError={!!error} />
        </div>

        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            hasError={!!error}
          />
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      {/* Volontairement HORS du <form> ci-dessus — même précaution que
          AdminLoginForm.tsx : un lien de navigation n'a rien à faire
          imbriqué dans ce formulaire. */}
      <p className="text-center text-sm">
        <Link
          href="/forgot-password"
          prefetch={false}
          className="font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </p>

      <p className="text-center text-sm text-slate-600">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  )
}
