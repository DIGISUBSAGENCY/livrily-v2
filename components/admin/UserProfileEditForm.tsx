'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import { useRouter } from 'next/navigation'
import { updateUserProfile, type ActionResult } from '@/app/(admin)/admin/utilisateurs/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ErrorText } from '@/components/ui/ErrorText'
import { COUNTRIES } from '@/lib/constants/countries'
import type { Profile } from '@/types/database'

const initialState: ActionResult = { error: null }

interface UserProfileEditFormProps {
  user: Profile
  countryLabel: string
}

// Vue (lecture, <dl>) par défaut ; "Modifier" bascule vers le formulaire.
// Pas de confirmation avant enregistrement ici (contrairement à
// WalletAdjustmentForm) — l'édition de profil n'est pas irréversible au
// même titre qu'un mouvement d'argent, cohérent avec le reste du panel
// admin (CommerceForm, ZoneForm... n'en demandent pas non plus).
export function UserProfileEditForm({ user, countryLabel }: UserProfileEditFormProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const boundAction = updateUserProfile.bind(null, user.id)
  const [state, formAction] = useFormState(boundAction, initialState)

  // Ferme le mode édition uniquement après un VRAI succès de soumission —
  // pas juste "state.error est null" (c'est aussi vrai au montage initial,
  // avant toute soumission). hasSubmitted distingue les deux cas.
  const hasSubmitted = useRef(false)
  useEffect(() => {
    if (!hasSubmitted.current) return
    hasSubmitted.current = false
    if (!state.error) {
      setIsEditing(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (!isEditing) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Profil</h2>
          <Button size="sm" variant="secondary" onClick={() => setIsEditing(true)}>
            Modifier
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900">{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Téléphone</dt>
            <dd className="text-slate-900">{user.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Pays</dt>
            <dd className="text-slate-900">{countryLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Profession</dt>
            <dd className="text-slate-900">{user.profession ?? '—'}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-500">Adresse</dt>
            <dd className="text-slate-900">{user.address ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Inscription</dt>
            <dd className="text-slate-900">{new Date(user.created_at).toLocaleDateString('fr-TN')}</dd>
          </div>
        </dl>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-3 font-semibold text-slate-900">Modifier le profil</h2>
      <form
        action={(formData) => {
          hasSubmitted.current = true
          formAction(formData)
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="full_name">Nom complet</Label>
          <Input id="full_name" name="full_name" defaultValue={user.full_name ?? ''} required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={user.email ?? ''} required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ''} required hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="country">Pays</Label>
          <Select id="country" name="country" defaultValue={user.country ?? 'TN'} required hasError={!!state.error}>
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="profession">Profession (optionnel)</Label>
          <Input id="profession" name="profession" defaultValue={user.profession ?? ''} hasError={!!state.error} />
        </div>
        <div>
          <Label htmlFor="address">Adresse</Label>
          <Input id="address" name="address" defaultValue={user.address ?? ''} required hasError={!!state.error} />
        </div>

        {state.error && <ErrorText>{state.error}</ErrorText>}

        <div className="flex gap-2">
          <SubmitButton size="sm" pendingLabel="Enregistrement…">
            Enregistrer
          </SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
            Annuler
          </Button>
        </div>
      </form>
    </div>
  )
}
