'use client'

import { useFormState } from 'react-dom'
import Link from 'next/link'
import { signIn, type AuthFormState } from '@/app/(auth)/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import { AuthDivider } from '@/components/auth/AuthDivider'

const initialState: AuthFormState = { error: null }

export function LoginForm() {
  const [state, formAction] = useFormState(signIn, initialState)

  return (
    <div className="space-y-5">
      <GoogleSignInButton label="Se connecter avec Google" />
      <AuthDivider />

      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required hasError={!!state.error} />
        </div>

        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            hasError={!!state.error}
          />
        </div>

        {state.error && <ErrorText>{state.error}</ErrorText>}

        <SubmitButton className="w-full" pendingLabel="Connexion…">
          Se connecter
        </SubmitButton>
      </form>

      {/* Volontairement HORS du <form> ci-dessus (form action={formAction}
          lié à un Server Action) — même précaution que AdminLoginForm.tsx :
          un lien de navigation n'a rien à faire imbriqué dans ce formulaire.
          prefetch={false} pour la même raison qu'admin : éviter qu'un
          prefetch fait avant qu'une éventuelle redirection middleware ne
          soit corrigée ne reste caché dans le cache du routeur. */}
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
