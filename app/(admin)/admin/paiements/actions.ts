'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Valide un virement de commande en attente : payment_status → 'paid'.
// Réservé aux admins (policy orders_update_commerce_or_admin) ; le trigger
// enforce_commerce_order_transitions ne s'applique qu'aux acteurs commerce,
// pas admin, donc aucun contournement particulier n'est nécessaire ici.
export async function verifyOrderPayment(orderId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'paid', payment_verified_by: user.id, payment_verified_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('payment_status', 'awaiting_verification')

  if (error) {
    return { error: 'Impossible de valider ce paiement, réessaie.' }
  }

  revalidatePath('/admin/paiements')
  revalidatePath('/admin')
  return { error: null }
}

// Rejette un virement : payment_status → 'rejected'. La preuve n'est PAS
// effacée (trace pour audit). Le client voit le badge "rejeté" sur
// /commandes/[id] (OrderRealtimeView) et peut renvoyer une preuve
// (resubmitPaymentProof, cf. app/(client)/commandes/[id]/actions.ts).
export async function rejectOrderPayment(orderId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('orders')
    .update({ payment_status: 'rejected' })
    .eq('id', orderId)
    .eq('payment_status', 'awaiting_verification')

  if (error) {
    return { error: 'Impossible de rejeter ce paiement, réessaie.' }
  }

  revalidatePath('/admin/paiements')
  revalidatePath('/admin')
  return { error: null }
}
