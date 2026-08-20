'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { saveOneSignalPlayerId } from '@/lib/notifications/actions'

interface OneSignalPushSubscriptionChangeEvent {
  current: { id: string | null; optedIn: boolean }
}

interface OneSignalPushSubscription {
  id: string | null
  // optedIn/optIn/optOut : ajoutés pour NotificationToggle.tsx (Paramètres
  // du compte) — pas utilisés par ce fichier lui-même, mais déclarés ici
  // pour garder une seule définition globale de window.OneSignalDeferred
  // (deux `declare global` incompatibles sur le même nom entreraient en
  // conflit).
  optedIn: boolean
  optIn: () => Promise<void>
  optOut: () => Promise<void>
  addEventListener: (
    event: 'change',
    listener: (event: OneSignalPushSubscriptionChangeEvent) => void
  ) => void
}

interface OneSignalSdk {
  init: (options: { appId: string }) => Promise<void>
  User: { PushSubscription: OneSignalPushSubscription }
}

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalSdk) => void | Promise<void>>
  }
}

// N'affiche/ne charge strictement rien si la clé publique n'est pas
// configurée — même dégradé que le reste de l'app (Flouci, Google Maps).
// Rendu inconditionnel dans app/layout.tsx : client et admin ont besoin
// d'être notifiables (proposition reçue, offre acceptée, livraison à
// confirmer, paiement crédité — cf. lib/notifications/*).
export function OneSignalInit({ userId }: { userId: string | null }) {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID

  useEffect(() => {
    if (!appId || !userId) return

    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({ appId })

      const currentId = OneSignal.User.PushSubscription.id
      if (currentId) void saveOneSignalPlayerId(currentId)

      OneSignal.User.PushSubscription.addEventListener('change', (event) => {
        if (event.current.id) void saveOneSignalPlayerId(event.current.id)
      })
    })
  }, [appId, userId])

  if (!appId) return null

  return <Script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" strategy="afterInteractive" defer />
}
