'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// Un seul toggle marche/arrêt (pas de préférences par catégorie) : aucune
// notion de catégorie de notification n'existe côté envoi (OneSignal sert
// une seule liste d'abonnés par joueur, pas de segmentation "proposition
// reçue" vs "paiement crédité") — un toggle plus fin mentirait sur ce que
// l'app peut réellement respecter.
export function NotificationToggle() {
  const [supported, setSupported] = useState(false)
  const [optedIn, setOptedIn] = useState(false)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return

    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (OneSignal) => {
      setSupported(true)
      setOptedIn(OneSignal.User.PushSubscription.optedIn)
      OneSignal.User.PushSubscription.addEventListener('change', (event) => {
        setOptedIn(event.current.optedIn)
      })
    })
  }, [])

  function handleToggle() {
    setIsPending(true)
    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (OneSignal) => {
      if (OneSignal.User.PushSubscription.optedIn) {
        await OneSignal.User.PushSubscription.optOut()
      } else {
        await OneSignal.User.PushSubscription.optIn()
      }
      setIsPending(false)
    })
  }

  if (!supported) {
    return (
      <p className="text-sm text-slate-500">
        Les notifications push ne sont pas disponibles sur cet appareil ou navigateur.
      </p>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Notifications push</p>
        <p className="text-xs text-slate-500">
          Proposition reçue, offre acceptée, livraison à confirmer, paiement crédité…
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={optedIn}
        aria-label="Activer ou désactiver les notifications push"
        onClick={handleToggle}
        disabled={isPending}
        className={cn(
          'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60',
          optedIn ? 'bg-brand-600' : 'bg-slate-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            optedIn ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  )
}
