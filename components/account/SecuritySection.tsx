'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Phone, KeyRound, ShieldCheck as ShieldCheckIcon } from 'lucide-react'
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm'
import { MfaSetupForm } from '@/components/auth/MfaSetupForm'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { enrollMfaFactor, verifyMfaEnrollment, disableMfaFactor } from '@/app/profil/parametres/actions'

interface SecuritySectionProps {
  email: string | null
  phone: string | null
  isAdmin: boolean
  hasVerifiedFactor: boolean
  factorId: string | null
}

// Lignes lecture seule + formulaire de changement de mot de passe + 2FA
// (TOTP, optionnelle pour ce rôle — obligatoire uniquement pour les
// comptes admin, appliqué côté middleware, pas ici). N'affiche plus "Non
// disponible" : la double authentification est réellement construite
// (lib/mfa.ts, Supabase Auth natif, vérifié en direct).
export function SecuritySection({ email, phone, isAdmin, hasVerifiedFactor, factorId }: SecuritySectionProps) {
  const router = useRouter()
  const [showSetup, setShowSetup] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [disableError, setDisableError] = useState<string | null>(null)

  const rows = [
    { icon: Mail, label: 'Email', value: email ?? 'Non renseigné' },
    { icon: Phone, label: 'Téléphone', value: phone || 'Non renseigné' },
    { icon: KeyRound, label: 'Mot de passe', value: '••••••••' },
  ]

  function handleDisable() {
    if (!factorId) return
    if (!window.confirm('Désactiver la double authentification sur ce compte ?')) return
    setDisableError(null)
    startTransition(async () => {
      const result = await disableMfaFactor(factorId)
      if (result.error) setDisableError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="flex items-center gap-2 text-slate-500">
              <row.icon className="h-4 w-4 flex-shrink-0" aria-hidden />
              {row.label}
            </dt>
            <dd className="font-medium text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-sm font-medium text-slate-900">Changer le mot de passe</p>
        <ChangePasswordForm />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <ShieldCheckIcon className="h-4 w-4 flex-shrink-0" aria-hidden />
            Double authentification (2FA)
          </p>
          {hasVerifiedFactor && !showSetup && (
            <span className="text-xs font-medium text-brand-700">Activée</span>
          )}
        </div>

        {hasVerifiedFactor ? (
          <div>
            <p className="text-sm text-slate-500">
              Un code à 6 chiffres est demandé à chaque connexion, en plus du mot de passe.
            </p>
            {isAdmin ? (
              <p className="mt-2 text-xs text-slate-400">
                Obligatoire pour les comptes administrateur — ne peut pas être désactivée ici.
              </p>
            ) : (
              <>
                <Button type="button" variant="secondary" size="sm" className="mt-3" disabled={isPending} onClick={handleDisable}>
                  {isPending ? 'Désactivation…' : 'Désactiver'}
                </Button>
                {disableError && <ErrorText className="mt-2">{disableError}</ErrorText>}
              </>
            )}
          </div>
        ) : showSetup ? (
          <MfaSetupForm enrollAction={enrollMfaFactor} verifyAction={verifyMfaEnrollment} />
        ) : (
          <div>
            <p className="text-sm text-slate-500">
              Non activée — ajoute une étape de vérification supplémentaire à la connexion via une
              application comme Google Authenticator ou Authy.
            </p>
            <Button type="button" size="sm" className="mt-3" onClick={() => setShowSetup(true)}>
              Activer
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
