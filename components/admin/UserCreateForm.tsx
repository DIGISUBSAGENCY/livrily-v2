'use client'

import { useFormState } from 'react-dom'
import { createUserByAdmin } from '@/app/(admin)/admin/utilisateurs/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { COUNTRIES } from '@/lib/constants/countries'
import type { ActionResult } from '@/app/(admin)/admin/utilisateurs/actions'

const initialState: ActionResult = { error: null }

export function UserCreateForm() {
  const [state, formAction] = useFormState(createUserByAdmin, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="full_name">Nom complet</Label>
        <Input id="full_name" name="full_name" required hasError={!!state.error} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required hasError={!!state.error} />
      </div>
      <div>
        <Label htmlFor="password">Mot de passe initial</Label>
        <Input
          id="password"
          name="password"
          type="text"
          minLength={6}
          required
          hasError={!!state.error}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          À transmettre toi-même à l&apos;utilisateur — il pourra le changer une fois connecté.
        </p>
      </div>
      <div>
        <Label htmlFor="phone">Téléphone</Label>
        <Input id="phone" name="phone" type="tel" placeholder="20123456" required hasError={!!state.error} />
      </div>
      <div>
        <Label htmlFor="country">Pays</Label>
        <Select id="country" name="country" defaultValue="TN" required hasError={!!state.error}>
          {COUNTRIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="profession">Profession (optionnel)</Label>
        <Input id="profession" name="profession" hasError={!!state.error} />
      </div>
      <div>
        <Label htmlFor="address">Adresse de livraison</Label>
        <Input id="address" name="address" required hasError={!!state.error} />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton pendingLabel="Création…">Créer le compte</SubmitButton>
    </form>
  )
}
