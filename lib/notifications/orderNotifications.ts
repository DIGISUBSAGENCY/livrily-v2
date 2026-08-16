// Phase 5, Module 4 : notifications déclenchées par le cycle de vie d'une
// commande. Centralisé ici (plutôt que dupliqué dans checkout/actions.ts,
// commerce/commandes/actions.ts et admin/commandes/actions.ts, qui
// appellent ces deux fonctions) pour n'écrire les messages qu'une fois.
//
// Utilise le client admin (service role) : ces fonctions tournent après
// qu'une écriture a déjà réussi côté appelant, peu importe l'acteur — pas
// besoin de repasser par RLS pour une simple lecture de contact.
//
// Best-effort de bout en bout : voir lib/onesignal.ts / lib/twilio.ts, les
// deux points d'entrée utilisés ici n'échouent jamais visiblement. Le
// try/catch englobant est une double sécurité (ex: commerce/client
// introuvable) pour que ces fonctions ne puissent jamais faire échouer la
// Server Action appelante.
import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/onesignal'
import { sendWhatsAppOrSms } from '@/lib/twilio'
import { formatTND } from '@/lib/format'
import type { OrderStatus } from '@/types/database'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

const CLIENT_STATUS_MESSAGES: Partial<Record<OrderStatus, (commerceName: string) => string>> = {
  accepted: (c) => `Ta commande chez ${c} a été acceptée et est en préparation.`,
  ready: (c) => `Ta commande chez ${c} est prête, elle part bientôt en livraison.`,
  delivering: (c) => `Ta commande chez ${c} est en route !`,
  delivered: (c) => `Ta commande chez ${c} a été livrée.`,
  cancelled: (c) => `Ta commande chez ${c} a été annulée.`,
}

// Notifie le CLIENT d'un changement de statut (push + WhatsApp/SMS). Pas de
// message pour `pending` (statut de création, pas une transition).
export async function notifyClientOrderStatusChange(orderId: string, status: OrderStatus): Promise<void> {
  const buildMessage = CLIENT_STATUS_MESSAGES[status]
  if (!buildMessage) return

  try {
    const adminClient = createAdminClient()
    const { data: order } = await adminClient
      .from('orders')
      .select('client_id, commerce_id, cancelled_reason')
      .eq('id', orderId)
      .single()
    if (!order) return

    const [{ data: client }, { data: commerce }] = await Promise.all([
      adminClient.from('profiles').select('onesignal_player_id, phone').eq('id', order.client_id).single(),
      adminClient.from('commerces').select('name').eq('id', order.commerce_id).single(),
    ])
    if (!client || !commerce) return

    let message = buildMessage(commerce.name)
    if (status === 'cancelled' && order.cancelled_reason) {
      message += ` Motif : ${order.cancelled_reason}`
    }

    await Promise.all([
      sendPushToUser(client.onesignal_player_id, 'Livrily', message, `${SITE_URL}/commandes/${orderId}`),
      sendWhatsAppOrSms(client.phone, message),
    ])
  } catch (error) {
    console.error('[notifications] Échec notification client (changement de statut) :', error)
  }
}

// Notifie le COMMERCE (push uniquement — pas de WhatsApp pour ce cas,
// conformément à la spec du module) dès qu'une nouvelle commande arrive.
export async function notifyCommerceNewOrder(orderId: string): Promise<void> {
  try {
    const adminClient = createAdminClient()
    const { data: order } = await adminClient.from('orders').select('commerce_id, total').eq('id', orderId).single()
    if (!order) return

    const { data: commerce } = await adminClient
      .from('commerces')
      .select('owner_id')
      .eq('id', order.commerce_id)
      .single()
    if (!commerce?.owner_id) return

    const { data: owner } = await adminClient
      .from('profiles')
      .select('onesignal_player_id')
      .eq('id', commerce.owner_id)
      .single()
    if (!owner) return

    await sendPushToUser(
      owner.onesignal_player_id,
      'Nouvelle commande',
      `Nouvelle commande reçue — ${formatTND(order.total)}.`,
      `${SITE_URL}/commerce/commandes/${orderId}`
    )
  } catch (error) {
    console.error('[notifications] Échec notification commerce (nouvelle commande) :', error)
  }
}
