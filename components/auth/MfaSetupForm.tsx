'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { Card } from '@/components/ui/Card'

interface MfaEnrollResult {
  error: string | null
  factorId?: string
  qrCodeDataUri?: string
  secret?: string
}

interface MfaVerifyResult {
  error: string | null
}

interface MfaSetupFormProps {
  enrollAction: () => Promise<MfaEnrollResult>
  // Bindée à factorId côté appelant. Pour /admin/2fa (enrôlement forcé),
  // l'action appelle redirect() en interne — la navigation prend le relais
  // avant que router.refresh() ci-dessous ne s'exécute. Pour l'activation
  // optionnelle (/profil/parametres), elle renvoie juste { error: null } et
  // router.refresh() suffit à rafraîchir l'état affiché.
  verifyAction: (factorId: string, code: string) => Promise<MfaVerifyResult>
}

// Lance l'enrôlement automatiquement au montage (pas de bouton "commencer"
// intermédiaire — le contexte appelant, page forcée ou section Sécurité,
// a déjà son propre bouton d'entrée) : affiche le QR + secret dès que
// possible, l'utilisateur n'a plus qu'à scanner et entrer le code.
export function MfaSetupForm({ enrollAction, verifyAction }: MfaSetupFormProps) {
  const router = useRouter()
  const [enrollment, setEnrollment] = useState<MfaEnrollResult | null>(null)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    enrollAction().then((result) => {
      if (cancelled) return
      if (result.error) setEnrollError(result.error)
      else setEnrollment(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollment?.factorId || code.trim().length !== 6) {
      setVerifyError('Entre le code à 6 chiffres affiché dans ton application.')
      return
    }
    setVerifyError(null)
    startTransition(async () => {
      const result = await verifyAction(enrollment.factorId!, code.trim())
      if (result.error) setVerifyError(result.error)
      else router.refresh()
    })
  }

  if (enrollError) {
    return <ErrorText>{enrollError}</ErrorText>
  }

  if (!enrollment) {
    return <p className="text-sm text-slate-500">Préparation…</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="mb-2 text-sm text-slate-600">
          Scanne ce QR code avec Google Authenticator, Authy ou une application équivalente.
        </p>
        {enrollment.qrCodeDataUri && (
          // eslint-disable-next-line @next/next/no-img-element -- data URI SVG généré par Supabase, pas d'optimisation next/image pertinente
          <img
            src={enrollment.qrCodeDataUri}
            alt="QR code de configuration de la double authentification"
            className="h-40 w-40 rounded-lg border border-slate-200 bg-white p-2"
          />
        )}
      </div>

      {enrollment.secret && (
        <Card className="bg-slate-50">
          <p className="text-xs text-slate-500">Le QR code ne scanne pas ? Entre ce code manuellement :</p>
          <code className="mt-1 block break-all text-sm font-medium text-slate-900">{enrollment.secret}</code>
        </Card>
      )}

      <div>
        <Label htmlFor="mfa_code">Code à 6 chiffres</Label>
        <Input
          id="mfa_code"
          name="mfa_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          hasError={!!verifyError}
        />
      </div>

      {verifyError && <ErrorText>{verifyError}</ErrorText>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Vérification…' : 'Activer la double authentification'}
      </Button>
    </form>
  )
}
