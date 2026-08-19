'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface ErrorFallbackProps {
  reset: () => void
  title?: string
  message?: string
}

// Rendu par les error.tsx de chaque segment de route (convention Next.js
// App Router : boundary posée automatiquement autour de la page). reset()
// retente le rendu du segment sans recharger toute l'application.
export function ErrorFallback({ reset, title = 'Une erreur est survenue', message }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-6 w-6 text-red-500" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="max-w-sm text-sm text-slate-500">
        {message ?? "Quelque chose s'est mal passé. Réessaie, ou reviens plus tard si le problème persiste."}
      </p>
      <Button onClick={reset} variant="secondary" size="sm">
        Réessayer
      </Button>
    </div>
  )
}
