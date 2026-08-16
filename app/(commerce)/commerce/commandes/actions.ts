'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { notifyClientOrderStatusChange } from '@/lib/notifications/orderNotifications'
import type { OrderStatus } from '@/types/database'

export interface ActionResult {
  error: string | null
}

// Miroir du trigger enforce_commerce_order_transitions (garde-fou en base) :
// vérifié ici en amont pour renvoyer un message clair plutôt que l'erreur
// SQL brute si jamais l'UI laissait passer une transition invalide.
const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['ready', 'cancelled'],
  ready: ['delivering', 'cancelled'],
  delivering: ['delivered'],
  delivered: [],
  cancelled: [],
}

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  options?: { deliveryStaffId?: string | null; cancelledReason?: string }
): Promise<ActionResult> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, commerce_id, payment_method, payment_status')
    .eq('id', orderId)
    .eq('commerce_id', commerce.id)
    .single()

  if (orderError || !order) {
    return { error: 'Commande introuvable.' }
  }

  if (!allowedTransitions[order.status].includes(nextStatus)) {
    return { error: `Impossible de passer de "${order.status}" à "${nextStatus}".` }
  }

  if (order.status === 'pending' && nextStatus === 'accepted' && order.payment_method === 'virement' && order.payment_status !== 'paid') {
    return {
      error: "Cette commande est payée par virement et n'a pas encore été vérifiée par l'administration.",
    }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: nextStatus,
      delivery_staff_id: options?.deliveryStaffId ?? undefined,
      cancelled_reason: nextStatus === 'cancelled' ? options?.cancelledReason ?? null : undefined,
    })
    .eq('id', orderId)

  if (updateError) {
    return { error: "Impossible de mettre à jour le statut, réessaie." }
  }

  // Phase 5 — Module 4 : notifie le client (push + WhatsApp/SMS). Best-effort.
  await notifyClientOrderStatusChange(orderId, nextStatus)

  revalidatePath('/commerce/commandes')
  revalidatePath(`/commerce/commandes/${orderId}`)
  return { error: null }
}

// Phase 5 — Module 6 : photo de preuve obligatoire pour marquer une
// commande livrée (revérifié ici en plus du trigger
// enforce_delivery_proof_required en base, pour un message clair).
export async function markOrderDelivered(orderId: string, formData: FormData): Promise<ActionResult> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, commerce_id')
    .eq('id', orderId)
    .eq('commerce_id', commerce.id)
    .single()

  if (orderError || !order) {
    return { error: 'Commande introuvable.' }
  }
  if (order.status !== 'delivering') {
    return { error: "Cette commande n'est pas en cours de livraison." }
  }

  const proofFile = formData.get('delivery_proof')
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return { error: 'Une photo de preuve de livraison est obligatoire.' }
  }

  const path = `${orderId}/proof.jpg`
  const { error: uploadError } = await supabase.storage
    .from('delivery-proofs')
    .upload(path, proofFile, { contentType: proofFile.type || 'image/jpeg', upsert: true })

  if (uploadError) {
    return { error: "Impossible d'envoyer la photo, réessaie." }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'delivered', delivery_proof_url: path })
    .eq('id', orderId)

  if (updateError) {
    return { error: "Impossible de marquer la commande comme livrée, réessaie." }
  }

  // Phase 5 — Module 4 : notifie le client (push + WhatsApp/SMS). Best-effort.
  await notifyClientOrderStatusChange(orderId, 'delivered')

  revalidatePath('/commerce/commandes')
  revalidatePath(`/commerce/commandes/${orderId}`)
  return { error: null }
}

export async function sendDeliveryPosition(orderId: string, lat: number, lng: number): Promise<ActionResult> {
  const commerce = await getCurrentCommerce()
  if (!commerce) return { error: 'Compte commerce non configuré.' }

  const supabase = await createClient()
  const { error } = await supabase.from('delivery_tracking').insert({
    order_id: orderId,
    commerce_id: commerce.id,
    lat,
    lng,
  })

  if (error) {
    return { error: "Impossible d'envoyer la position." }
  }

  return { error: null }
}
