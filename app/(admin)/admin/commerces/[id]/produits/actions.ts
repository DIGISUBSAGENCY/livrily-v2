'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { productSchema } from '@/lib/validations/product'

export interface ProductFormState {
  error: string | null
}

// Équivalent admin de app/(commerce)/commerce/produits/actions.ts : mêmes
// règles de validation (productSchema, RLS products_*_owner_or_admin déjà
// en place), mais le commerce ciblé vient de l'URL (commerceId explicite)
// plutôt que de getCurrentCommerce() — un admin gère n'importe quel commerce.
function parseProductForm(formData: FormData) {
  return productSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    price: formData.get('price'),
    unit: formData.get('unit') || 'pièce',
    image_url: formData.get('image_url') || undefined,
    is_available: formData.get('is_available') === 'on',
  })
}

export async function createProduct(
  commerceId: string,
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('products').insert({ ...parsed.data, commerce_id: commerceId })

  if (error) {
    return { error: "Impossible de créer le produit, réessaie." }
  }

  revalidatePath(`/admin/commerces/${commerceId}/produits`)
  redirect(`/admin/commerces/${commerceId}/produits`)
}

export async function updateProduct(
  commerceId: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const parsed = parseProductForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update(parsed.data)
    .eq('id', productId)
    .eq('commerce_id', commerceId)

  if (error) {
    return { error: 'Impossible de mettre à jour le produit, réessaie.' }
  }

  revalidatePath(`/admin/commerces/${commerceId}/produits`)
  redirect(`/admin/commerces/${commerceId}/produits`)
}

export async function deleteProduct(commerceId: string, productId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase.from('products').delete().eq('id', productId).eq('commerce_id', commerceId)

  if (error) {
    return { error: 'Impossible de supprimer ce produit (peut-être déjà commandé).' }
  }

  revalidatePath(`/admin/commerces/${commerceId}/produits`)
  return { error: null }
}

export async function toggleProductAvailability(
  commerceId: string,
  productId: string,
  isAvailable: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId)
    .eq('commerce_id', commerceId)

  if (error) {
    return { error: 'Impossible de mettre à jour la disponibilité.' }
  }

  revalidatePath(`/admin/commerces/${commerceId}/produits`)
  return { error: null }
}
