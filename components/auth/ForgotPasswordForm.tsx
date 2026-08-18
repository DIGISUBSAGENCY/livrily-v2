'use client'

import Link from 'next/link'
import { useFormState } from 'react-dom'
import { requestPasswordReset, type ForgotPasswordFormState } from '@/app/(auth)/forgot-password/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ForgotPasswordFormState = { error: null, success: false }

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(requestPasswordReset, initialState)

  if (state.success) {
    return (
      <div className="text-center">
        <p className="text-sm text-slate-700">
          Un email vient de t&apos;être envoyé avec un code à 6 chiffres. Entre-le sur la page
          suivante avec ton nouveau mot de passe.
        </p>
        <Link
          href={`/reset-password${state.email ? `?email=${encodeURIComponent(state.email)}` : ''}`}
          className="mt-4 inline-block text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
        >
          J&apos;ai mon code →
        </Link>
      </div>
    )
  }

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
