'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import { Pencil } from 'lucide-react'
import { updateBio, type BioFormState } from '@/app/profil/actions'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { Button } from '@/components/ui/Button'

interface ProfileBioProps {
  bio: string | null
  editable: boolean
}

const initialState: BioFormState = { error: null }

export function ProfileBio({ bio, editable }: ProfileBioProps) {
  const [state, formAction] = useFormState(updateBio, initialState)
  const [isEditing, setIsEditing] = useState(false)
  // Ne referme l'éditeur qu'après une vraie soumission réussie — pas au
  // montage (state.error vaut aussi null avant toute soumission), sinon un
  // échec de validation fermerait l'éditeur en emportant le message d'erreur
  // avec lui.
  const hasSubmitted = useRef(false)

  useEffect(() => {
    if (hasSubmitted.current && state.error === null) {
      setIsEditing(false)
      hasSubmitted.current = false
    }
  }, [state])

  if (isEditing) {
    return (
      <form action={formAction} onSubmit={() => (hasSubmitted.current = true)} className="mt-2">
        <textarea
          name="bio"
          rows={3}
          maxLength={280}
          defaultValue={bio ?? ''}
          placeholder="Présente-toi en quelques mots…"
          autoFocus
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {state.error && <ErrorText>{state.error}</ErrorText>}
        <div className="mt-2 flex gap-2">
          <SubmitButton size="sm">Enregistrer</SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
            Annuler
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      <p className="text-sm text-slate-600">{bio || 'Aucune présentation pour le moment'}</p>
      {editable && (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          aria-label="Modifier la présentation"
          className="mt-0.5 flex-shrink-0 text-slate-400 hover:text-brand-600"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
