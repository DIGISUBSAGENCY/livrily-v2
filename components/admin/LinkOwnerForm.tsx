'use client'

import { useFormState } from 'react-dom'
import { linkCommerceOwner, type ActionResult } from '@/app/(admin)/admin/comptes-commerce/actions'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ActionResult = { error: null }

export function LinkOwnerForm({ commerceId }: { commerceId: string }) {
  const action = linkCommerceOwner.bind(null, commerceId)
  const [state, formAction] = useFormState(action, initialState)

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <div className="flex-1">
        <Input name="email" type="email" placeholder="email@exemple.com" required hasError={!!state.error} />
        {state.error && <ErrorText>{state.error}</ErrorText>}
      </div>
      <SubmitButton size="sm" pendingLabel="Liaison…">
        Lier
      </SubmitButton>
    </form>
  )
}
