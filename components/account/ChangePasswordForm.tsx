'use client'

import { useFormState } from 'react-dom'
import { changePassword, type ChangePasswordFormState } from '@/app/profil/parametres/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ChangePasswordFormState = { error: null, success: false }

export function ChangePasswordForm() {
  const [state, formAction] = useFormState(changePassword, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="currentPassword">Mot de passe actuel</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="newPassword">Nouveau mot de passe</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</Label>
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
      {state.success && <p className="text-sm text-brand-600">Mot de passe mis à jour.</p>}

      <SubmitButton className="w-full" pendingLabel="Enregistrement…">
        Changer le mot de passe
      </SubmitButton>
    </form>
  )
}
