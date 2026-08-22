'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyUser } from '@/lib/notifications/create'

export interface ActionResult {
  error: string | null
}

// Valide un virement en attente : le passe à 'escrowed'. Réservé aux admins
// (RLS travel_payments_update_admin_only) ; le trigger set_updated_at gère
// updated_at, on pose nous-mêmes verified_by/verified_at.
export async function verifyTravelPayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: payment, error } = await supabase
    .from('travel_payments')
    .update({ status: 'escrowed', verified_by: user.id, verified_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'awaiting_verification')
    .select('request_id')
    .single()

  if (error || !payment) {
    return { error: 'Impossible de valider ce paiement, réessaie.' }
  }

  // TRANSACTION_UPDATE au client — best-effort, ne bloque jamais la
  // validation elle-même si la notification échoue.
  const { data: request } = await supabase.from('travel_requests').select('client_id').eq('id', payment.request_id).single()
  if (request) {
    await notifyUser({
      userId: request.client_id,
      type: 'transaction_update',
      title: 'Paiement vérifié',
      body: 'Ton virement a été vérifié, les fonds sont maintenant sous séquestre.',
      relatedObjectType: 'travel_request',
      relatedObjectId: payment.request_id,
    })
  }

  revalidatePath('/admin/jibli-paiements')
  return { error: null }
}
