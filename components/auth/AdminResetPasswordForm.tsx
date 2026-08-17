'use client'

import { useFormState } from 'react-dom'
import { adminResetPassword, type ResetPasswordFormState } from '@/app/(admin-auth)/admin/reset-password/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ResetPasswordFormState = { error: null }

export function AdminResetPasswordForm() {
  const [state, formAction] = useFormState(adminResetPassword, initialState)

  return (
    <form action={formAction} className="space-y-4">
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
