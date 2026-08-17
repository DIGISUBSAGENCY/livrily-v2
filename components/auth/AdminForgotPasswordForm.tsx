'use client'

import Link from 'next/link'
import { useFormState } from 'react-dom'
import { adminForgotPassword, type ForgotPasswordFormState } from '@/app/(admin-auth)/admin/forgot-password/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ForgotPasswordFormState = { error: null, success: false }

export function AdminForgotPasswordForm() {
  const [state, formAction] = useFormState(adminForgotPassword, initialState)

  if (state.success) {
    return (
      <div className="text-center">
        <p className="text-sm text-slate-700">
          Un email de réinitialisation a été envoyé. Vérifie ta boîte mail et clique sur le lien pour
          choisir un nouveau mot de passe.
        </p>
        <Link
          href="/admin/login"
          className="mt-4 inline-block text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline"
        >
          Retour à la connexion
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
        Envoyer le lien de réinitialisation
      </SubmitButton>

      <p className="text-center text-sm text-slate-600">
        <Link href="/admin/login" className="font-medium text-brand-600 transition-colors hover:text-brand-700 hover:underline">
          ← Retour à la connexion
        </Link>
      </p>
    </form>
  )
}
