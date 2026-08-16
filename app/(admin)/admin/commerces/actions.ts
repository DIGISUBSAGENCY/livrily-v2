'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { commerceSchema } from '@/lib/validations/commerce'

export interface CommerceFormState {
  error: string | null
}

export interface ActionResult {
  error: string | null
}

function parseCommerceForm(formData: FormData) {
  return commerceSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category'),
    description: formData.get('description') || undefined,
    address: formData.get('address') || undefined,
    lat: formData.get('lat') || undefined,
    lng: formData.get('lng') || undefined,
    zone_id: formData.get('zone_id') || undefined,
    phone: formData.get('phone') || undefined,
    is_active: formData.get('is_active') === 'on',
  })
}

export async function createCommerce(_prev: CommerceFormState, formData: FormData): Promise<CommerceFormState> {
  const parsed = parseCommerceForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.from('commerces').insert(parsed.data).select('id').single()

  if (error || !data) {
    return { error: 'Impossible de créer le commerce, réessaie.' }
  }

  revalidatePath('/admin/commerces')
  redirect(`/admin/commerces/${data.id}`)
}

export async function updateCommerce(
  commerceId: string,
  _prev: CommerceFormState,
  formData: FormData
): Promise<CommerceFormState> {
  const parsed = parseCommerceForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('commerces').update(parsed.data).eq('id', commerceId)

  if (error) {
    return { error: 'Impossible de mettre à jour le commerce, réessaie.' }
  }

  revalidatePath('/admin/commerces')
  revalidatePath(`/admin/commerces/${commerceId}`)
  redirect('/admin/commerces')
}

export async function toggleCommerceActive(commerceId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('commerces').update({ is_active: isActive }).eq('id', commerceId)

  if (error) return { error: 'Impossible de mettre à jour le commerce.' }

  revalidatePath('/admin/commerces')
  return { error: null }
}

export async function deleteCommerce(commerceId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('commerces').delete().eq('id', commerceId)

  if (error) {
    return { error: 'Impossible de supprimer : ce commerce a des commandes ou produits. Désactive-le plutôt.' }
  }

  revalidatePath('/admin/commerces')
  return { error: null }
}
