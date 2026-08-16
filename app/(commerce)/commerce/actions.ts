'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'

export interface ActionResult {
  error: string | null
}

// Fermeture/ouverture temporaire pilotée par le commerce lui-même (pause,
// jour férié...). Ne touche jamais `is_active`, réservé à l'admin
// (désactivation de compte) — voir le commentaire sur la policy
// `commerces_update_owner_or_admin` dans schema.sql.
export async function toggleCommerceOpen(isOpen: boolean): Promise<ActionResult> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('commerces')
    .update({ is_open: isOpen })
    .eq('id', commerce.id)

  if (error) {
    return { error: 'Impossible de mettre à jour ce statut, réessaie.' }
  }

  revalidatePath('/commerce')
  revalidatePath(`/commerces/${commerce.id}`)
  revalidatePath('/commerces')
  return { error: null }
}
