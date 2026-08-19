'use client'

import Link from 'next/link'
import { useFormState } from 'react-dom'
import { requestPasswordReset, type ForgotPasswordFormState } from '@/app/(auth)/forgot-password/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ForgotPasswordFormState = { error: null }

// Pas d'état de confirmation intermédiaire : en cas de succès, l'action
// redirige elle-même directement vers /reset-password (email pré-rempli).
export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(requestPasswordReset, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required hasError={!!state.error} />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Envoyer le code de réinitialisation
      </SubmitButton>

      <p className="text-center text-sm text-slate-600">
        <Link href="/login" className="font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline">
          ← Retour à la connexion
        </Link>
      </p>
    </form>
  )
}
