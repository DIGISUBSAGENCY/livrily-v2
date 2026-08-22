'use client'

import { useState, useTransition } from 'react'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

interface MfaChallengeFormProps {
  factorId: string
  // Appelle redirect() en interne en cas de succès (step-up de connexion,
  // toujours vers une destination précise) — voir MfaSetupForm pour la
  // même remarque sur la navigation qui prend le relais.
  verifyAction: (factorId: string, code: string) => Promise<{ error: string | null }>
}

// Distinct de MfaSetupForm : pas de QR/secret ici, le facteur est déjà
// enrôlé — juste le code de l'app d'authentification pour élever la
// session déjà ouverte (aal1 -> aal2).
export function MfaChallengeForm({ factorId, verifyAction }: MfaChallengeFormProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length !== 6) {
      setError('Entre le code à 6 chiffres affiché dans ton application.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await verifyAction(factorId, code.trim())
      if (result.error) setError(result.error)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="mfa_challenge_code">Code de double authentification</Label>
        <Input
          id="mfa_challenge_code"
          name="mfa_challenge_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          hasError={!!error}
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Vérification…' : 'Confirmer'}
      </Button>
    </form>
  )
}
