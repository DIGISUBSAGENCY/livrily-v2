'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  const { error } = await supabase
    .from('travel_payments')
    .update({ status: 'escrowed', verified_by: user.id, verified_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'awaiting_verification')

  if (error) {
    return { error: 'Impossible de valider ce paiement, réessaie.' }
  }

  revalidatePath('/admin/jibli-paiements')
  return { error: null }
}
