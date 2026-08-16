'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { staffSchema } from '@/lib/validations/staff'

export interface StaffFormState {
  error: string | null
}

export async function addStaff(_prev: StaffFormState, formData: FormData): Promise<StaffFormState> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const parsed = staffSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone') || undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('commerce_delivery_staff')
    .insert({ ...parsed.data, commerce_id: commerce.id })

  if (error) {
    return { error: "Impossible d'ajouter cette personne, réessaie." }
  }

  revalidatePath('/commerce/equipe')
  return { error: null }
}

export async function toggleStaffActive(staffId: string, isActive: boolean): Promise<{ error: string | null }> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('commerce_delivery_staff')
    .update({ is_active: isActive })
    .eq('id', staffId)
    .eq('commerce_id', commerce.id)

  if (error) return { error: 'Impossible de mettre à jour.' }

  revalidatePath('/commerce/equipe')
  return { error: null }
}

export async function removeStaff(staffId: string): Promise<{ error: string | null }> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('commerce_delivery_staff')
    .delete()
    .eq('id', staffId)
    .eq('commerce_id', commerce.id)

  if (error) return { error: 'Impossible de supprimer.' }

  revalidatePath('/commerce/equipe')
  return { error: null }
}
