'use client'

import Link from 'next/link'
import { useFormState } from 'react-dom'
import { adminSignIn, type AdminAuthFormState } from '@/app/(admin-auth)/admin/login/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: AdminAuthFormState = { error: null }

// Volontairement minimal : email + mot de passe uniquement. Pas de bouton
// Google, pas de lien "créer un compte" — /admin/login n'est pas un point
// d'entrée self-service, seulement pour des comptes admin déjà provisionnés.
export function AdminLoginForm({ next }: { next?: string }) {
  const [state, formAction] = useFormState(adminSignIn, initialState)

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

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

      <p className="text-center text-sm">
        <Link
          href="/admin/forgot-password"
          className="font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  )
}
