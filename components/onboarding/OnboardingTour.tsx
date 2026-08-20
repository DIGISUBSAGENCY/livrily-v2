'use client'

import { useState, useTransition } from 'react'
import { Plane, ShieldCheck, Bell, Rocket, X } from 'lucide-react'
import { markOnboardingSeen } from '@/app/(client)/jibli/actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const steps = [
  {
    icon: Plane,
    title: 'Publie ta demande',
    description:
      "Colle le lien du produit, ajoute une description et une photo si tu en as une — les voyageurs qui passent par ta destination pourront te faire une offre.",
  },
  {
    icon: ShieldCheck,
    title: 'Vérifie ton identité',
    description:
      "Avant ta première transaction, on te demande ta pièce d'identité et un selfie (~2 min). Sur Livrily, la livraison se fait directement entre client et voyageur, sans intermédiaire — vérifier l'identité des deux parties avant qu'un paiement réel soit engagé protège tout le monde.",
  },
  {
    // Reformulé pour rester honnête : pas de cloche en app pour l'instant,
    // seulement des notifications push navigateur (OneSignal, déjà en
    // place) — cf. discussion avant de coder cette étape.
    icon: Bell,
    title: 'Reste informé',
    description:
      "Active les notifications de ton navigateur pour être alerté à chaque étape : proposition reçue, offre acceptée, livraison à confirmer, paiement crédité.",
  },
  {
    icon: Rocket,
    title: "C'est parti !",
    description: 'Tu es prêt à publier ta première demande, ou à devenir voyageur toi-même.',
  },
]

export function OnboardingTour({ shouldShow }: { shouldShow: boolean }) {
  const [isVisible, setIsVisible] = useState(shouldShow)
  const [step, setStep] = useState(0)
  const [, startTransition] = useTransition()

  if (!isVisible) return null

  function dismiss() {
    setIsVisible(false)
    startTransition(() => {
      markOnboardingSeen()
    })
  }

  const current = steps[step]
  const isLastStep = step === steps.length - 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <Card className="relative w-full max-w-sm">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
            <current.icon className="h-6 w-6 text-brand-600" aria-hidden />
          </div>
          <p className="mt-3 text-xs font-medium text-slate-400">
            Étape {step + 1} / {steps.length}
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{current.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{current.description}</p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 w-1.5 rounded-full', i === step ? 'bg-brand-600' : 'bg-slate-200')}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Passer
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setStep((s) => s - 1)}>
                Précédent
              </Button>
            )}
            {isLastStep ? (
              <Button size="sm" onClick={dismiss}>
                C&apos;est parti
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Suivant
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
