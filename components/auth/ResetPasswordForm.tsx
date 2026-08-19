'use client'

import { useState, useTransition } from 'react'
import { useFormState } from 'react-dom'
import { resetPassword, type ResetPasswordFormState } from '@/app/(auth)/reset-password/actions'
import { resendPasswordResetCode } from '@/app/(auth)/forgot-password/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ResetPasswordFormState = { error: null }

export function ResetPasswordForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [state, formAction] = useFormState(resetPassword, initialState)
  // Contrôlé (pas defaultValue) : le bouton "Envoyer" a besoin de la valeur
  // courante du champ, y compris si l'utilisateur la corrige avant de
  // redemander un code.
  const [email, setEmail] = useState(defaultEmail)
  const [isResending, startResend] = useTransition()
  const [resendMessage, setResendMessage] = useState<{ text: string; isError: boolean } | null>(null)

  function handleResend() {
    setResendMessage(null)
    startResend(async () => {
      const result = await resendPasswordResetCode(email)
      setResendMessage(
        result.error ? { text: result.error, isError: true } : { text: 'Nouveau code envoyé.', isError: false }
      )
    })
  }

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
          <Button
            type="button"
            variant="secondary"
            onClick={handleResend}
            disabled={isResending || !email}
          >
            {isResending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
        {resendMessage && (
          <p className={`mt-1.5 text-xs ${resendMessage.isError ? 'text-red-600' : 'text-brand-600'}`}>
            {resendMessage.text}
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
