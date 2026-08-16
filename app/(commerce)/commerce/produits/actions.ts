'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { productSchema } from '@/lib/validations/product'

export interface ProductFormState {
  error: string | null
}

function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    price: formData.get('price'),
    unit: formData.get('unit') || 'pièce',
    image_url: formData.get('image_url') || undefined,
    is_available: formData.get('is_available') === 'on',
    requires_prescription: formData.get('requires_prescription') === 'on',
  })
}

export async function createProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('products').insert({ ...parsed.data, commerce_id: commerce.id })

  if (error) {
    return { error: "Impossible de créer le produit, réessaie." }
  }

  revalidatePath('/commerce/produits')
  redirect('/commerce/produits')
}

export async function updateProduct(
  productId: string,
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', productId)
    .eq('commerce_id', commerce.id)

  if (error) {
    return { error: 'Impossible de mettre à jour le produit, réessaie.' }
  }

  revalidatePath('/commerce/produits')
  redirect('/commerce/produits')
}

export async function deleteProduct(productId: string): Promise<{ error: string | null }> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()
  const { error } = await supabase.from('products').delete().eq('id', productId).eq('commerce_id', commerce.id)

  if (error) {
    return { error: 'Impossible de supprimer ce produit (peut-être déjà commandé).' }
  }

  revalidatePath('/commerce/produits')
  return { error: null }
}

export async function toggleProductAvailability(productId: string, isAvailable: boolean): Promise<{ error: string | null }> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId)
    .eq('commerce_id', commerce.id)

  if (error) {
    return { error: 'Impossible de mettre à jour la disponibilité.' }
  }

  revalidatePath('/commerce/produits')
  return { error: null }
}
