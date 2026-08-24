'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Rapprochement comptable a posteriori, PAS une activation : boosted_until
// est déjà posé depuis l'achat (purchase_boost_virement(), cf. schema.sql —
// virement = activation immédiate, jamais gatée sur une vérification
// admin). Contrairement à verifyTravelPayment (jibli-paiements/actions.ts),
// aucune notification n'est envoyée ici : il n'y a rien de nouveau à
// annoncer au voyageur, sa mise en avant tourne déjà.
export async function verifyBoostPayment(paymentId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: payment, error } = await supabase
    .from('boost_payments')
    .update({ status: 'paid', verified_by: user.id, verified_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'awaiting_verification')
    .select('id')
    .single()

  if (error || !payment) {
    return { error: 'Impossible de valider ce paiement, réessaie.' }
  }

  revalidatePath('/admin/boost-paiements')
  return { error: null }
}
