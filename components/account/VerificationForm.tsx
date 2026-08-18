'use client'

import { useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'
import { useRouter } from 'next/navigation'
import { submitIdentityVerification, type ActionResult } from '@/app/profil/verification-identite/actions'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ActionResult = { error: null }

const fileInputClassName =
  'block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100'

export function VerificationForm() {
  const router = useRouter()
  const [state, formAction] = useFormState(submitIdentityVerification, initialState)

  // Même garde-fou que UserProfileEditForm.tsx : router.refresh() seulement
  // après une VRAIE soumission réussie, pas au montage initial (où
  // state.error est aussi null).
  const hasSubmitted = useRef(false)
  useEffect(() => {
    if (!hasSubmitted.current) return
    hasSubmitted.current = false
    if (!state.error) router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form
      action={(formData) => {
        hasSubmitted.current = true
        formAction(formData)
      }}
      className="space-y-4"
    >
      <div>
        <Label htmlFor="id_document">Pièce d&apos;identité (CIN, recto)</Label>
        <input id="id_document" name="id_document" type="file" accept="image/*" required className={fileInputClassName} />
      </div>

      <div>
        <Label htmlFor="selfie">Selfie</Label>
        <input id="selfie" name="selfie" type="file" accept="image/*" required className={fileInputClassName} />
        <p className="mt-1.5 text-xs text-slate-500">Visage bien visible, sans lunettes de soleil ni couvre-chef.</p>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Envoyer pour vérification
      </SubmitButton>
    </form>
  )
}
