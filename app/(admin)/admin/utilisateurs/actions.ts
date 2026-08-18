'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Suspend/réactive un compte client. RLS profiles_update_own_or_admin
// autorise déjà l'admin à modifier n'importe quel profil ; aucun trigger ne
// bloque is_active (prevent_wallet_self_edit et prevent_role_self_escalation
// ne s'appliquent qu'aux auto-modifications par le même compte, jamais le
// cas ici puisque c'est l'admin qui agit sur le profil d'un autre).
export async function toggleUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId)

  if (error) {
    console.error('[admin/utilisateurs] toggleUserActive a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: 'Impossible de mettre à jour le statut de ce compte, réessaie.' }
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath(`/admin/utilisateurs/${userId}`)
  return { error: null }
}
