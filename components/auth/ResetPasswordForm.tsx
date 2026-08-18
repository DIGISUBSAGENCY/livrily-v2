'use client'

import { useFormState } from 'react-dom'
import { resetPassword, type ResetPasswordFormState } from '@/app/(auth)/reset-password/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ResetPasswordFormState = { error: null }

export function ResetPasswordForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [state, formAction] = useFormState(resetPassword, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail}
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="token">Code reçu par email</Label>
        <Input
          id="token"
          name="token"
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          placeholder="123456"
          autoComplete="one-time-code"
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
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
          required
          hasError={!!state.error}
        />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Enregistrement…">
        Définir le nouveau mot de passe
      </SubmitButton>
    </form>
  )
}
