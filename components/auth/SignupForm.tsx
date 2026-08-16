'use client'

import { useFormState } from 'react-dom'
import Link from 'next/link'
import { signUp, type AuthFormState } from '@/app/(auth)/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import { AuthDivider } from '@/components/auth/AuthDivider'

const initialState: AuthFormState = { error: null }

interface SignupFormProps {
  defaultReferralCode?: string
}

// defaultReferralCode vient de searchParams côté page (Server Component) —
// pas de useSearchParams() ici, pour éviter d'avoir à ajouter une frontière
// <Suspense> juste pour préremplir ce champ.
export function SignupForm({ defaultReferralCode = '' }: SignupFormProps) {
  const [state, formAction] = useFormState(signUp, initialState)

  return (
    <div className="space-y-5">
      <GoogleSignInButton referralCode={defaultReferralCode} />
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
            autoComplete="new-password"
            minLength={6}
            required
            hasError={!!state.error}
          />
        </div>

        <div>
          <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            hasError={!!state.error}
          />
        </div>

        <div>
          <Label htmlFor="referral_code">Code de parrainage (optionnel)</Label>
          <Input
            id="referral_code"
            name="referral_code"
            defaultValue={defaultReferralCode}
            placeholder="Ex : AB12CD34"
            className="uppercase"
          />
        </div>

        {state.error && <ErrorText>{state.error}</ErrorText>}

        <SubmitButton className="w-full" pendingLabel="Création du compte…">
          Créer mon compte
        </SubmitButton>

        <p className="text-center text-sm text-slate-600">
          Déjà un compte ?{' '}
          <Link href="/login" className="font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  )
}
