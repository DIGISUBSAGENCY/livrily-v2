'use client'

import { useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'
import { useRouter } from 'next/navigation'
import { submitIdentityVerification, type ActionResult } from '@/app/profil/verification-identite/actions'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { FileInput } from '@/components/ui/FileInput'

const initialState: ActionResult = { error: null }

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
        <FileInput id="id_document" name="id_document" required />
      </div>

      <div>
        <Label htmlFor="selfie">Selfie</Label>
        <FileInput id="selfie" name="selfie" required />
        <p className="mt-1.5 text-xs text-slate-500">Visage bien visible, sans lunettes de soleil ni couvre-chef.</p>
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Envoyer pour vérification
      </SubmitButton>
    </form>
  )
}
