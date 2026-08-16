'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { GoogleIcon } from '@/components/auth/GoogleIcon'

// ⚠️ Nécessite le provider Google activé côté Supabase (Authentication >
// Providers > Google, avec un Client ID/Secret Google Cloud) — rien à
// configurer dans ce projet (pas de variable d'env ici, le secret vit côté
// Supabase, pas dans notre serveur). Tant que ce n'est pas fait, ce bouton
// redirige vers une page d'erreur Supabase — jamais testé en direct, pas de
// credentials disponibles (même réserve que lib/flouci.ts).
//
// /auth/callback (déjà existant, construit pour la confirmation email)
// gère aussi ce retour : le flow OAuth de Supabase repose sur le même
// échange `?code=` → session, donc aucune route dédiée n'était nécessaire.
interface GoogleSignInButtonProps {
  label?: string
  // Signup uniquement : signInWithOAuth() ne permet pas d'injecter de
  // métadonnées custom (contrairement à auth.signUp()) — le code est donc
  // déposé dans un cookie de courte durée, lu et appliqué côté serveur par
  // /auth/callback une fois la session Google établie. Sans ça, un
  // parrainage seulement perdu silencieusement pour qui choisit Google.
  referralCode?: string
}

export function GoogleSignInButton({ label = 'Continuer avec Google', referralCode }: GoogleSignInButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isRedirecting, setIsRedirecting] = useState(false)

  async function handleClick() {
    setError(null)
    setIsRedirecting(true)

    if (referralCode) {
      document.cookie = `jibli_referral_code=${encodeURIComponent(referralCode)}; path=/; max-age=600; SameSite=Lax`
    }

    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    // En cas de succès, signInWithOAuth redirige déjà le navigateur — on
    // n'arrive ici que si l'appel a échoué avant même la redirection.
    if (oauthError) {
      setIsRedirecting(false)
      setError("Impossible de démarrer la connexion Google, réessaie.")
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={isRedirecting}
        onClick={handleClick}
      >
        <GoogleIcon className="h-4 w-4" aria-hidden />
        {isRedirecting ? 'Redirection…' : label}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
