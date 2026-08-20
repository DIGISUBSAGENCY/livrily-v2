'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface IdentityRequiredModalProps {
  // S'affiche au chargement si non vérifié — "Plus tard" referme
  // localement (pas de logique d'ouverture pilotée depuis l'extérieur,
  // chaque page ne l'utilise qu'en mode interstitiel au montage).
  defaultOpen: boolean
}

// Modèle Livrily : le voyageur livre directement l'objet au client, pas
// d'intermédiaire logistique séparé — donc PAS de "contrat tripartite"
// (erreur corrigée après coup, cette formulation ne reflète pas notre
// modèle). La vraie raison d'être du KYC ici : sécuriser un échange direct
// entre deux particuliers où un vrai paiement est mis en séquestre, pas
// une formalité administrative gratuite. Même pattern visuel que
// OnboardingTour.tsx (overlay + Card + croix de fermeture).
export function IdentityRequiredModal({ defaultOpen }: IdentityRequiredModalProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <Card className="relative w-full max-w-sm">
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          aria-label="Fermer"
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <ShieldAlert className="h-6 w-6 text-amber-600" aria-hidden />
          </div>
          <h2 className="mt-3 text-lg font-bold tracking-tight text-slate-900">Identité non vérifiée</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sur Livrily, la livraison se fait directement entre client et voyageur, sans
            intermédiaire — le paiement reste séquestré jusqu&apos;à la confirmation de réception.
            Vérifier l&apos;identité des deux parties avant qu&apos;un paiement réel soit engagé protège
            autant le client que le voyageur contre la fraude.
          </p>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p className="font-medium text-slate-700">~2 minutes, il te faut :</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
            <li>Une pièce d&apos;identité (carte d&apos;identité ou passeport)</li>
            <li>Un selfie</li>
          </ul>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            Plus tard
          </Button>
          <Link href="/profil/verification-identite">
            <Button size="sm">Commencer la vérification</Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
