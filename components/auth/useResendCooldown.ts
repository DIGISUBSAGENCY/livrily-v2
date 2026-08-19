'use client'

import { useEffect, useState, useTransition } from 'react'

const COOLDOWN_SECONDS = 60

interface ResendResult {
  error: string | null
  success: boolean
}

// Cooldown de 60s partagé par ResetPasswordForm et AdminResetPasswordForm
// (bouton "Envoyer" à côté du champ code) — démarre au CLIC, pas seulement
// en cas de succès de l'envoi, pour limiter les appels à l'endpoint même en
// cas d'échecs répétés. Évite le spam d'emails / les abus sur Resend.
export function useResendCooldown(onResend: () => Promise<ResendResult>) {
  const [cooldown, setCooldown] = useState(0)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)

  useEffect(() => {
    if (cooldown === 0) return
    const timeout = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timeout)
  }, [cooldown])

  function trigger() {
    if (cooldown > 0 || isPending) return
    setMessage(null)
    setCooldown(COOLDOWN_SECONDS)
    startTransition(async () => {
      const result = await onResend()
      setMessage(
        result.error ? { text: result.error, isError: true } : { text: 'Nouveau code envoyé.', isError: false }
      )
    })
  }

  const label = cooldown > 0 ? `Renvoyer dans ${cooldown}s` : isPending ? 'Envoi…' : 'Envoyer'

  return { trigger, label, disabled: isPending || cooldown > 0, message }
}
