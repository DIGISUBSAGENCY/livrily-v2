'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Renvoi de preuve après rejet par l'admin (/admin/paiements). Toutes les
// conditions sont revérifiées ici même si le trigger enforce_client_order_resubmit
// les impose déjà en base — messages d'erreur plus clairs pour l'utilisateur.
export async function resubmitPaymentProof(
  orderId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, payment_method, payment_status, status')
    .eq('id', orderId)
    .single()

  if (orderError || !order) return { error: 'Commande introuvable.' }
  if (order.client_id !== user.id) return { error: 'Non autorisé.' }
  if (order.payment_method !== 'virement') {
    return { error: "Cette commande n'utilise pas le virement." }
  }
  if (order.payment_status !== 'rejected') {
    return { error: "Le paiement de cette commande n'a pas été rejeté." }
  }
  if (order.status !== 'pending') {
    return { error: "Cette commande n'est plus en attente." }
  }

  const proofFile = formData.get('payment_proof')
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return { error: "Merci de joindre une nouvelle capture d'écran." }
  }

  const path = `${user.id}/${orderId}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, proofFile, { contentType: proofFile.type || 'image/jpeg', upsert: true })

  if (uploadError) {
    return { error: "Impossible d'envoyer la preuve, réessaie." }
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ payment_proof_url: path, payment_status: 'awaiting_verification' })
    .eq('id', orderId)

  if (updateError) {
    return { error: 'Impossible de mettre à jour la commande, réessaie.' }
  }

  revalidatePath(`/commandes/${orderId}`)
  return { error: null }
}

// Phase 5 — Module 6 : note laissée par le client une fois la commande
// livrée. RLS (ratings_insert_own_delivered_order) impose déjà
// order.status='delivered' et client_id=auth.uid() ; revérifié ici pour un
// message d'erreur clair plutôt que l'erreur SQL brute.
export async function submitRating(
  orderId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, client_id, commerce_id, status')
    .eq('id', orderId)
    .single()

  if (orderError || !order) return { error: 'Commande introuvable.' }
  if (order.client_id !== user.id) return { error: 'Non autorisé.' }
  if (order.status !== 'delivered') return { error: "Cette commande n'a pas encore été livrée." }

  const score = Number(formData.get('score'))
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { error: 'Note invalide.' }
  }
  const comment = String(formData.get('comment') ?? '').trim()

  const { error } = await supabase.from('ratings').insert({
    order_id: orderId,
    client_id: user.id,
    commerce_id: order.commerce_id,
    score,
    comment: comment || null,
  })

  if (error) {
    return { error: 'Impossible d’enregistrer ton avis (peut-être déjà envoyé), réessaie.' }
  }

  revalidatePath(`/commandes/${orderId}`)
  revalidatePath(`/commerces/${order.commerce_id}`)
  return { error: null }
}
