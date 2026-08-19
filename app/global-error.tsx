'use client'

import { useEffect } from 'react'
import './globals.css'

// Convention Next.js App Router : ce fichier remplace intégralement le
// root layout (donc redéfinit <html>/<body>) quand une erreur s'échappe
// jusque-là — cas rare (root layout lui-même, ou erreur non rattrapée par
// un error.tsx de segment), mais sans lui l'utilisateur verrait l'écran
// d'erreur générique de Next.js plutôt qu'un fallback à l'identité Livrily.
// Volontairement minimal (pas de Button/ErrorFallback importés) : ce
// composant doit rester robuste même si le reste de l'app est cassé.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center font-sans text-slate-900 antialiased">
        <h1 className="text-lg font-semibold">Une erreur est survenue</h1>
        <p className="max-w-sm text-sm text-slate-500">
          L&apos;application a rencontré un problème inattendu. Réessaie, ou reviens plus tard si le
          problème persiste.
        </p>
        <button
          onClick={reset}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          Réessayer
        </button>
      </body>
    </html>
  )
}
