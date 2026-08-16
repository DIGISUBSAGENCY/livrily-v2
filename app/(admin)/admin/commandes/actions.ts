'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyClientOrderStatusChange } from '@/lib/notifications/orderNotifications'
import type { OrderStatus } from '@/types/database'

export interface ActionResult {
  error: string | null
}

// Supervision admin : contrairement au compte commerce (restreint par le
// trigger enforce_commerce_order_transitions à la séquence pending→
// accepted→ready→delivering→delivered), l'admin en est explicitement
// exempté en base — utile pour débloquer une commande en cas de souci
// (ex: commerce ayant fermé sans mettre à jour le statut). Le trigger
// enforce_virement_payment_gating reste actif même pour l'admin : impossible
// de forcer pending→accepted sur un virement non vérifié, il faut d'abord
// valider le paiement via /admin/paiements.
export async function updateOrderStatusAdmin(orderId: string, nextStatus: OrderStatus): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId)

  if (error) {
    return { error: error.message || 'Transition de statut impossible.' }
  }

  // Phase 5 — Module 4 : notifie le client (push + WhatsApp/SMS). Best-effort.
  await notifyClientOrderStatusChange(orderId, nextStatus)

  revalidatePath('/admin/commandes')
  revalidatePath(`/admin/commandes/${orderId}`)
  return { error: null }
}

// Assignation manuelle du personnel de livraison interne du commerce (ou
// retrait, staffId=null) — dépannage : normalement fait par le commerce
// lui-même au moment de "Démarrer la livraison" (Phase 3).
export async function assignDeliveryStaffAdmin(orderId: string, staffId: string | null): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('orders').update({ delivery_staff_id: staffId }).eq('id', orderId)

  if (error) {
    return { error: "Impossible d'assigner ce livreur." }
  }

  revalidatePath('/admin/commandes')
  revalidatePath(`/admin/commandes/${orderId}`)
  return { error: null }
}
