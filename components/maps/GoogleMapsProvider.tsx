'use client'

import { APIProvider } from '@vis.gl/react-google-maps'
import type { ReactNode } from 'react'

// Fournit le contexte Google Maps JS API à toute l'app (autocomplete
// d'adresse en Phase 1, cartes de tracking en Phase 2/3). Si la clé n'est
// pas encore configurée en dev, on rend quand même les enfants pour ne pas
// bloquer tout le site — les fonctionnalités cartes seront simplement inertes.
export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return <>{children}</>
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places']}>
      {children}
    </APIProvider>
  )
}
