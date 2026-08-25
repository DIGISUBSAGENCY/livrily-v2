'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyUser } from '@/lib/notifications/create'
import type { NotificationRelatedObjectType } from '@/types/database'

export interface ActionResult {
  error: string | null
}

// Rapprochement comptable a posteriori, PAS une activation : boosted_until
// est déjà posé depuis l'achat (purchase_boost_virement(), cf. schema.sql —
// virement = activation immédiate, jamais gatée sur une vérification
// admin). La notification ci-dessous annonce donc "Paiement vérifié" (même
// wording que verifyTravelPayment), pas "Boost activé" — rester honnête sur
// ce que cet événement représente réellement, la mise en avant tournait
// déjà depuis l'achat.
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
    .select('id, voyageur_id, trip_id, product_offer_id, request_id')
    .single()

  if (error || !payment) {
    return { error: 'Impossible de valider ce paiement, réessaie.' }
  }

  // boost_update, best-effort — même pattern que TRANSACTION_UPDATE dans
  // verifyTravelPayment (jibli-paiements/actions.ts) : Server Action (pas
  // un RPC SECURITY DEFINER ici), donc notifyUser()/service_role plutôt
  // qu'un insert direct. related_object_type dérivé de la colonne renseignée
  // sur boost_payments (une seule des trois, cf. contrainte
  // boost_payments_exactly_one_item).
  const relatedObjectType: NotificationRelatedObjectType = payment.trip_id
    ? 'trip'
    : payment.product_offer_id
      ? 'product_offer'
      : 'travel_request'
  const relatedObjectId = payment.trip_id ?? payment.product_offer_id ?? payment.request_id

  if (relatedObjectId) {
    await notifyUser({
      userId: payment.voyageur_id,
      type: 'boost_update',
      title: 'Paiement vérifié',
      body: 'Ton virement pour la mise en avant a été vérifié.',
      relatedObjectType,
      relatedObjectId,
    })
  }

  revalidatePath('/admin/boost-paiements')
  return { error: null }
}
