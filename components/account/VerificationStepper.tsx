'use client'

import Link from 'next/link'
import { Mail, ShieldCheck, Check } from 'lucide-react'
import { resendEmailConfirmation } from '@/app/profil/parametres/actions'
import { useResendCooldown } from '@/components/auth/useResendCooldown'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface VerificationStepperProps {
  emailVerified: boolean
  kycVerified: boolean
}

// CTA contextuel : cible l'étape non complétée. Si les deux sont faites,
// pas de CTA (rien à envoyer). Le renvoi d'email est protégé par le même
// cooldown 60s que le reste de l'app (useResendCooldown) — évite le spam
// sur supabase.auth.resend().
export function VerificationStepper({ emailVerified, kycVerified }: VerificationStepperProps) {
  const resend = useResendCooldown(resendEmailConfirmation)

  const steps = [
    { icon: Mail, label: 'Email', done: emailVerified },
    { icon: ShieldCheck, label: 'Identité', done: kycVerified },
  ]

  return (
    <div>
      <div className="flex items-center">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2',
                  step.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-400'
                )}
              >
                {step.done ? <Check className="h-4 w-4" aria-hidden /> : <step.icon className="h-4 w-4" aria-hidden />}
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-slate-900">{step.label}</p>
                <p className="text-xs text-slate-400">{step.done ? 'Vérifié' : 'Requis'}</p>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-2 h-0.5 flex-1', steps[i + 1].done || step.done ? 'bg-brand-600' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-slate-500">
        Sur Livrily, la livraison se fait directement entre client et voyageur, sans
        intermédiaire — vérifier ton email et ton identité protège ton paiement, qui reste
        séquestré jusqu&apos;à la confirmation de réception.
      </p>

      {!emailVerified && (
        <div className="mt-4">
          <Button size="sm" onClick={resend.trigger} disabled={resend.disabled} className="disabled:bg-brand-600 disabled:shadow-soft">
            {resend.label === 'Envoyer' ? "M'envoyer le lien de vérification" : resend.label}
          </Button>
          {resend.message && (
            <p className={cn('mt-1.5 text-xs', resend.message.isError ? 'text-red-600' : 'text-brand-600')}>
              {resend.message.text}
            </p>
          )}
        </div>
      )}

      {emailVerified && !kycVerified && (
        <div className="mt-4">
          <Link href="/profil/verification-identite">
            <Button size="sm">Commencer la vérification d&apos;identité</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
