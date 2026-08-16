'use client'

import { useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'
import { addStaff, type StaffFormState } from '@/app/(commerce)/commerce/equipe/actions'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: StaffFormState = { error: null }

export function StaffForm() {
  const [state, formAction] = useFormState(addStaff, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  // Pas de redirection après ajout (on reste sur la page) : on vide le
  // formulaire nous-mêmes une fois la Server Action passée sans erreur.
  useEffect(() => {
    if (!state.error) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="flex-1">
        <Input name="full_name" placeholder="Nom complet" required hasError={!!state.error} />
      </div>
      <div className="flex-1">
        <Input name="phone" placeholder="Téléphone (optionnel)" />
      </div>
      <SubmitButton size="md" pendingLabel="Ajout…">
        Ajouter
      </SubmitButton>
      {state.error && <ErrorText className="w-full">{state.error}</ErrorText>}
    </form>
  )
}
