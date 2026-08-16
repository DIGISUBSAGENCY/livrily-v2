'use client'

import { useFormState } from 'react-dom'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { BankTransferInfo } from '@/types/database'

interface BankTransferFormState {
  error: string | null
}

interface BankTransferFormProps {
  action: (prevState: BankTransferFormState, formData: FormData) => Promise<BankTransferFormState>
  bankInfo?: BankTransferInfo
  submitLabel: string
}

const initialState: BankTransferFormState = { error: null }

export function BankTransferForm({ action, bankInfo, submitLabel }: BankTransferFormProps) {
  const [state, formAction] = useFormState(action, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="bank_name">Banque</Label>
        <Input id="bank_name" name="bank_name" defaultValue={bankInfo?.bank_name} required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="account_holder">Titulaire du compte</Label>
        <Input
          id="account_holder"
          name="account_holder"
          defaultValue={bankInfo?.account_holder}
          required
          hasError={!!state.error}
        />
      </div>

      <div>
        <Label htmlFor="rib">RIB</Label>
        <Input id="rib" name="rib" defaultValue={bankInfo?.rib} required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="iban">IBAN (optionnel)</Label>
        <Input id="iban" name="iban" defaultValue={bankInfo?.iban ?? ''} />
      </div>

      <div>
        <Label htmlFor="flouci_phone">Numéro Flouci (optionnel)</Label>
        <Input id="flouci_phone" name="flouci_phone" defaultValue={bankInfo?.flouci_phone ?? ''} placeholder="20123456" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={bankInfo?.is_active ?? true}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Actif (affiché aux clients au checkout)
      </label>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}
