'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { travelProposalSchema, counterOfferSchema, type ProposalValidity } from '@/lib/validations/travel'

const VALIDITY_DURATIONS_MS: Record<ProposalValidity, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}
import { generateFlouciPayment, isFlouciConfigured, tndToMillimes, FlouciConfigError, FlouciApiError } from '@/lib/flouci'
import { getIdentityStatus, isIdentityVerified } from '@/lib/identity'

export interface ProposalFormState {
  error: string | null
}

export interface ActionResult {
  error: string | null
}

export async function createProposal(
  requestId: string,
  _prev: ProposalFormState,
  formData: FormData
): Promise<ProposalFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/${requestId}`)

  const parsed = travelProposalSchema.safeParse({
    item_price: formData.get('item_price'),
    delivery_fee: formData.get('delivery_fee'),
    travel_date: formData.get('travel_date') || undefined,
    pickup_city: formData.get('pickup_city') || undefined,
    validity: formData.get('validity') || undefined,
    message: formData.get('message') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const expiresAt = parsed.data.validity
    ? new Date(Date.now() + VALIDITY_DURATIONS_MS[parsed.data.validity]).toISOString()
    : null

  const { error } = await supabase.from('travel_proposals').insert({
    request_id: requestId,
    voyageur_id: user.id,
    item_price: parsed.data.item_price,
    delivery_fee: parsed.data.delivery_fee,
    travel_date: parsed.data.travel_date ?? null,
    pickup_city: parsed.data.pickup_city ?? null,
    expires_at: expiresAt,
    message: parsed.data.message ?? null,
  })

  if (error) {
    // Contrainte unique (request_id, voyageur_id) : déjà proposé une fois.
    if (error.code === '23505') {
      return { error: 'Tu as déjà fait une proposition sur cette demande.' }
    }
    return {
      error:
        "Impossible d'envoyer ta proposition (demande peut-être fermée, ou c'est ta propre demande).",
    }
  }

  revalidatePath(`/jibli/${requestId}`)
  return { error: null }
}

// Acceptation par virement : upload de la preuve puis appel RPC immédiat.
// travel_payments démarre à 'awaiting_verification' — un admin doit encore
// valider (/admin/jibli-paiements) avant que les fonds soient "escrowed".
export async function acceptProposalVirement(
  requestId: string,
  proposalId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/${requestId}`)

  // Même prérequis KYC que createTravelRequest — "accepter une offre" =
  // ce point d'entrée et initiateFlouciPayment ci-dessous.
  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: "Vérifie ton identité avant d'accepter une offre (page Profil)." }
  }

  const proofFile = formData.get('payment_proof')
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return { error: "Merci de joindre une capture d'écran de la preuve de virement." }
  }

  // Même bucket que les preuves de virement des commandes : privé, déjà
  // scopé par dossier utilisateur (policies payment_proofs_*).
  const path = `${user.id}/travel-${requestId}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, proofFile, { contentType: proofFile.type || 'image/jpeg', upsert: true })

  if (uploadError) {
    return { error: "Impossible d'envoyer la preuve de paiement, réessaie." }
  }

  const { error } = await supabase.rpc('accept_travel_proposal', {
    p_proposal_id: proposalId,
    p_payment_method: 'virement',
    p_payment_proof_url: path,
  })

  if (error) {
    return { error: error.message || "Impossible d'accepter cette proposition." }
  }

  revalidatePath(`/jibli/${requestId}`)
  revalidatePath('/jibli')
  return { error: null }
}

// Acceptation par Flouci : ne touche à rien en base ici — génère juste le
// lien de paiement et redirige. C'est le callback (après confirmation
// Flouci) qui appelle réellement accept_travel_proposal. Si le client
// abandonne le paiement, aucune donnée n'a été modifiée.
export async function initiateFlouciPayment(requestId: string, proposalId: string): Promise<ActionResult> {
  if (!isFlouciConfigured()) {
    return { error: "Le paiement Flouci n'est pas encore configuré. Choisis le virement en attendant." }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/${requestId}`)

  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: "Vérifie ton identité avant d'accepter une offre (page Profil)." }
  }

  const { data: proposal, error: proposalError } = await supabase
    .from('travel_proposals')
    .select('item_price, delivery_fee, status')
    .eq('id', proposalId)
    .eq('request_id', requestId)
    .single()

  if (proposalError || !proposal) {
    return { error: 'Proposition introuvable.' }
  }
  if (proposal.status !== 'pending') {
    return { error: "Cette proposition n'est plus en attente." }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const amountTnd = proposal.item_price + proposal.delivery_fee

  let paymentLink: string
  try {
    const result = await generateFlouciPayment({
      amount: tndToMillimes(amountTnd),
      trackingId: proposalId,
      successLink: `${siteUrl}/api/flouci/travel-callback?proposal_id=${proposalId}&request_id=${requestId}`,
      failLink: `${siteUrl}/jibli/${requestId}?flouci=failed`,
    })
    paymentLink = result.paymentLink
  } catch (err) {
    const message =
      err instanceof FlouciConfigError || err instanceof FlouciApiError
        ? err.message
        : 'Impossible de démarrer le paiement Flouci, réessaie.'
    return { error: message }
  }

  redirect(paymentLink)
}

// Négociation : dépose une contre-offre (montant + message) sur un fil
// existant. Toute la logique d'autorisation/tour de jeu vit dans la RPC
// (submit_counter_offer, schema.sql) — cette action ne fait que valider le
// formulaire et relayer l'erreur SQL si le tour n'est pas le bon.
export async function submitCounterOffer(
  requestId: string,
  proposalId: string,
  _prev: ProposalFormState,
  formData: FormData
): Promise<ProposalFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/${requestId}`)

  const parsed = counterOfferSchema.safeParse({
    item_price: formData.get('item_price'),
    delivery_fee: formData.get('delivery_fee'),
    message: formData.get('message') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const { error } = await supabase.rpc('submit_counter_offer', {
    p_proposal_id: proposalId,
    p_item_price: parsed.data.item_price,
    p_delivery_fee: parsed.data.delivery_fee,
    p_message: parsed.data.message ?? null,
  })

  if (error) {
    return { error: error.message || "Impossible d'envoyer cette contre-offre." }
  }

  revalidatePath(`/jibli/${requestId}`)
  return { error: null }
}

// Négociation : le VOYAGEUR accepte l'offre courante du client — ne déplace
// aucun argent (cf. commentaire sur agree_to_current_offer côté base), verrouille
// juste les termes. Le client conclut ensuite via acceptProposalVirement/
// initiateFlouciPayment, inchangées.
export async function agreeToCurrentOffer(requestId: string, proposalId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('agree_to_current_offer', { p_proposal_id: proposalId })

  if (error) {
    return { error: error.message || "Impossible d'accepter cette offre." }
  }

  revalidatePath(`/jibli/${requestId}`)
  return { error: null }
}

export async function withdrawProposal(requestId: string, proposalId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('travel_proposals')
    .update({ status: 'withdrawn' })
    .eq('id', proposalId)

  if (error) {
    return { error: 'Impossible de retirer cette proposition.' }
  }

  revalidatePath(`/jibli/${requestId}`)
  revalidatePath('/jibli/mes-propositions')
  return { error: null }
}

export async function advanceRequestStatus(
  requestId: string,
  nextStatus: 'in_transit' | 'completed'
): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('travel_requests').update({ status: nextStatus }).eq('id', requestId)

  if (error) {
    return { error: 'Transition de statut impossible.' }
  }

  revalidatePath(`/jibli/${requestId}`)
  return { error: null }
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('travel_requests').update({ status: 'cancelled' }).eq('id', requestId)

  if (error) {
    return { error: "Impossible d'annuler cette demande." }
  }

  revalidatePath(`/jibli/${requestId}`)
  revalidatePath('/jibli/mes-demandes')
  return { error: null }
}

// Le client confirme avoir reçu l'objet — seule action qui libère les fonds
// séquestrés (voir confirm_travel_receipt côté base pour le détail).
export async function confirmReceipt(requestId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_travel_receipt', { p_request_id: requestId })

  if (error) {
    return { error: error.message || 'Impossible de confirmer la réception.' }
  }

  revalidatePath(`/jibli/${requestId}`)
  revalidatePath('/jibli/mes-gains')
  return { error: null }
}
