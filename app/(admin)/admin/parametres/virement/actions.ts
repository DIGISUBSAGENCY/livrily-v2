'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { bankTransferSchema } from '@/lib/validations/bank'

export interface BankTransferFormState {
  error: string | null
}

export interface ActionResult {
  error: string | null
}

function parseBankTransferForm(formData: FormData) {
  return bankTransferSchema.safeParse({
    bank_name: formData.get('bank_name'),
    account_holder: formData.get('account_holder'),
    rib: formData.get('rib'),
    iban: formData.get('iban') || undefined,
    flouci_phone: formData.get('flouci_phone') || undefined,
    is_active: formData.get('is_active') === 'on',
  })
}

export async function createBankTransferInfo(
  _prev: BankTransferFormState,
  formData: FormData
): Promise<BankTransferFormState> {
  const parsed = parseBankTransferForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('bank_transfer_info')
    .insert({ ...parsed.data, updated_by: user?.id ?? null })

  if (error) {
    return { error: 'Impossible de créer ces coordonnées, réessaie.' }
  }

  revalidatePath('/admin/parametres/virement')
  redirect('/admin/parametres/virement')
}

export async function updateBankTransferInfo(
  bankInfoId: string,
  _prev: BankTransferFormState,
  formData: FormData
): Promise<BankTransferFormState> {
  const parsed = parseBankTransferForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('bank_transfer_info')
    .update({ ...parsed.data, updated_by: user?.id ?? null })
    .eq('id', bankInfoId)

  if (error) {
    return { error: 'Impossible de mettre à jour ces coordonnées, réessaie.' }
  }

  revalidatePath('/admin/parametres/virement')
  redirect('/admin/parametres/virement')
}

export async function toggleBankTransferActive(bankInfoId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('bank_transfer_info').update({ is_active: isActive }).eq('id', bankInfoId)

  if (error) return { error: 'Impossible de mettre à jour.' }

  revalidatePath('/admin/parametres/virement')
  return { error: null }
}
