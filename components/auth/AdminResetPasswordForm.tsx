'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { adminResetPassword, type ResetPasswordFormState } from '@/app/(admin-auth)/admin/reset-password/actions'
import { resendAdminPasswordResetCode } from '@/app/(admin-auth)/admin/forgot-password/actions'
import { useResendCooldown } from '@/components/auth/useResendCooldown'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ResetPasswordFormState = { error: null }

export function AdminResetPasswordForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [state, formAction] = useFormState(adminResetPassword, initialState)
  const [email, setEmail] = useState(defaultEmail)
  const resend = useResendCooldown(() => resendAdminPasswordResetCode(email))

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="token">Code reçu par email</Label>
        <div className="flex gap-2">
          <Input
            id="token"
            name="token"
            type="text"
            inputMode="numeric"
            pattern="\d{8}"
            maxLength={8}
            placeholder="12345678"
            autoComplete="one-time-code"
            required
            hasError={!!state.error}
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={resend.trigger} disabled={resend.disabled || !email}>
            {resend.label}
          </Button>
        </div>
        {resend.message && (
          <p className={`mt-1.5 text-xs ${resend.message.isError ? 'text-red-600' : 'text-brand-600'}`}>
            {resend.message.text}
          </p>
        )}
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
