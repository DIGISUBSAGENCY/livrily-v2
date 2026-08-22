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
import { disputeSchema } from '@/lib/validations/disputes'
import { reviewSchema } from '@/lib/validations/reviews'
import { getSiteUrl } from '@/lib/site'
import { notifyUser } from '@/lib/notifications/create'
import type { ReviewDirection } from '@/types/database'

export interface ProposalFormState {
  error: string | null
}

export interface ActionResult {
  error: string | null
}

export interface DisputeFormState {
  error: string | null
  success: boolean
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

  // Nouveau gate (n'existait pas avant) : faire une proposition engage
  // autant le voyageur que publier une demande engage le client — même
  // exigence KYC que createTravelRequest/acceptProposalVirement.
  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: "Vérifie ton identité avant de faire une proposition (page Profil)." }
  }

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

  // Trips (Phase 3, brique 2/N) : source_trip_id vient d'un champ caché du
  // formulaire (ProposalForm, pré-rempli depuis "Proposer" sur un match) —
  // donc falsifiable côté client. Revérifié ici que le trip existe, est
  // encore ouvert, et appartient bien à CE voyageur avant de l'inclure —
  // pas juste laissé à accept_travel_proposal() (qui a son propre garde-fou
  // silencieux, mais une erreur claire ici vaut mieux qu'un silence plus
  // tard). Un trip_id invalide/étranger n'empêche pas la proposition, juste
  // le lien au trip.
  const rawSourceTripId = formData.get('source_trip_id')
  let sourceTripId: string | null = null
  if (typeof rawSourceTripId === 'string' && rawSourceTripId) {
    const { data: trip } = await supabase
      .from('trips')
      .select('id')
      .eq('id', rawSourceTripId)
      .eq('voyageur_id', user.id)
      .eq('status', 'open')
      .maybeSingle()
    sourceTripId = trip?.id ?? null
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
    source_trip_id: sourceTripId,
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

// Trips (Phase 3, brique 2/N) — le client ne peut PAS créer de
// travel_proposals lui-même (RLS : voyageur_id = auth.uid() uniquement),
// donc "se connecter" à un trip depuis le panneau de matches d'une demande
// ne peut pas créer la mise en relation directement. Se contente de
// notifier le voyageur (REQUEST_MATCHED) — c'est LUI qui, depuis son
// propre trip, verra la demande dans ses matches et pourra "Proposer"
// (createProposal ci-dessus, avec source_trip_id). Pas de dédoublonnage si
// cliqué plusieurs fois sur le même match — simplification v1, pas gênant
// (best-effort, comme toute notification).
export async function expressInterestInTrip(requestId: string, tripId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: request } = await supabase
    .from('travel_requests')
    .select('client_id, item_description')
    .eq('id', requestId)
    .single()

  if (!request || request.client_id !== user.id) {
    return { error: 'Accès refusé.' }
  }

  const { data: trip } = await supabase.from('trips').select('voyageur_id').eq('id', tripId).eq('status', 'open').single()
  if (!trip) {
    return { error: "Ce trip n'est plus disponible." }
  }

  await notifyUser({
    userId: trip.voyageur_id,
    type: 'request_matched',
    title: 'Une demande pourrait te correspondre',
    body: `Un client a signalé son intérêt pour ton trip : "${request.item_description}".`,
    relatedObjectType: 'travel_request',
    relatedObjectId: requestId,
  })

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

  const siteUrl = getSiteUrl()
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

const STATUS_UPDATE_MESSAGES: Record<'in_transit' | 'completed', string> = {
  in_transit: 'Le voyageur a indiqué que ton envoi est en transit.',
  completed: 'Le voyageur a marqué ta mission comme livrée.',
}

export async function advanceRequestStatus(
  requestId: string,
  nextStatus: 'in_transit' | 'completed'
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: request, error } = await supabase
    .from('travel_requests')
    .update({ status: nextStatus })
    .eq('id', requestId)
    .select('client_id')
    .single()

  if (error || !request) {
    return { error: 'Transition de statut impossible.' }
  }

  // REQUEST_UPDATE au client — c'est le voyageur qui vient d'avancer le statut.
  await notifyUser({
    userId: request.client_id,
    type: 'request_update',
    title: 'Statut de mission mis à jour',
    body: STATUS_UPDATE_MESSAGES[nextStatus],
    relatedObjectType: 'travel_request',
    relatedObjectId: requestId,
  })

  revalidatePath(`/jibli/${requestId}`)
  return { error: null }
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: request, error } = await supabase
    .from('travel_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .select('accepted_proposal_id')
    .single()

  if (error || !request) {
    return { error: "Impossible d'annuler cette demande." }
  }

  // REQUEST_UPDATE au voyageur — seulement s'il y en avait déjà un accepté
  // (une demande encore 'open' sans proposition acceptée n'a personne à notifier).
  if (request.accepted_proposal_id) {
    const { data: proposal } = await supabase
      .from('travel_proposals')
      .select('voyageur_id')
      .eq('id', request.accepted_proposal_id)
      .single()
    if (proposal) {
      await notifyUser({
        userId: proposal.voyageur_id,
        type: 'request_update',
        title: 'Mission annulée',
        body: 'Le client a annulé cette demande.',
        relatedObjectType: 'travel_request',
        relatedObjectId: requestId,
      })
    }
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

// Ouvre un litige sur une mission — réservé au client (owner) et au
// voyageur accepté (RLS disputes_insert_involved, mêmes règles que la
// visibilité de la page détail). Un seul litige ouvert à la fois par
// personne et par mission (contrainte unique côté base).
export async function openDispute(
  requestId: string,
  _prev: DisputeFormState,
  formData: FormData
): Promise<DisputeFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/${requestId}`)

  const parsed = disputeSchema.safeParse({ reason: formData.get('reason') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', success: false }
  }

  const { error } = await supabase.from('disputes').insert({
    travel_request_id: requestId,
    opened_by: user.id,
    reason: parsed.data.reason,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Tu as déjà un litige ouvert sur cette mission.', success: false }
    }
    return { error: "Impossible d'ouvrir le litige, réessaie.", success: false }
  }

  revalidatePath(`/jibli/${requestId}`)
  revalidatePath('/profil/litiges')
  return { error: null, success: true }
}

export interface ReviewActionResult {
  error: string | null
}

// reviewee_id et direction sont CALCULÉS ici, jamais envoyés par le
// frontend (cf. contrainte générale du projet : ne jamais faire confiance
// à un user_id envoyé par le client) — dérivés de la mission elle-même
// (client_id, voyageur de la proposition acceptée) et de qui appelle
// l'action. Défense en profondeur : la policy travel_reviews_insert_involved
// revérifie tout ça côté RLS de toute façon (client_confirmed_at, pas de
// litige ouvert, unique(travel_request_id, reviewer_id)).
export async function submitReview(requestId: string, rating: number, comment: string): Promise<ReviewActionResult> {
  const parsed = reviewSchema.safeParse({ rating, comment })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: request } = await supabase
    .from('travel_requests')
    .select('client_id, accepted_proposal_id')
    .eq('id', requestId)
    .single()

  if (!request) return { error: 'Mission introuvable.' }

  const { data: proposal } = request.accepted_proposal_id
    ? await supabase.from('travel_proposals').select('voyageur_id').eq('id', request.accepted_proposal_id).single()
    : { data: null }

  let revieweeId: string
  let direction: ReviewDirection
  if (user.id === request.client_id && proposal) {
    revieweeId = proposal.voyageur_id
    direction = 'client_to_voyageur'
  } else if (proposal && user.id === proposal.voyageur_id) {
    revieweeId = request.client_id
    direction = 'voyageur_to_client'
  } else {
    return { error: "Tu n'es pas partie prenante de cette mission." }
  }

  // Avis déjà déposé par l'AUTRE partie pour cette mission ? Si oui, cette
  // soumission déclenche la révélation MUTUELLE immédiate des deux avis
  // (cf. is_review_revealed() côté base) — sinon, la révélation n'aura lieu
  // que par écoulement du délai de 14 jours, qui n'a aucun événement
  // d'écriture (pas de notification possible ici pour ce cas, cf. plan).
  const { data: existingReview } = await supabase
    .from('travel_reviews')
    .select('reviewee_id')
    .eq('travel_request_id', requestId)
    .neq('reviewer_id', user.id)
    .maybeSingle()

  const { error } = await supabase.from('travel_reviews').insert({
    travel_request_id: requestId,
    reviewer_id: user.id,
    reviewee_id: revieweeId,
    direction,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Tu as déjà laissé un avis sur cette mission.' }
    }
    // RLS bloque si client_confirmed_at n'est pas posé, ou si un litige est
    // encore ouvert — remonté ici comme un message générique plutôt que
    // d'exposer error.message (détail RLS interne).
    return { error: "Impossible de soumettre l'avis pour l'instant." }
  }

  if (existingReview) {
    // Les deux avis sont désormais visibles à l'instant : le mien pour
    // revieweeId, et celui déjà déposé par l'autre partie (dont le
    // destinataire est justement moi, existingReview.reviewee_id).
    await notifyUser({
      userId: revieweeId,
      type: 'review_available',
      title: 'Nouvel avis disponible',
      body: 'Un avis sur ta dernière mission Jibli est maintenant visible.',
      relatedObjectType: 'travel_request',
      relatedObjectId: requestId,
    })
    await notifyUser({
      userId: existingReview.reviewee_id,
      type: 'review_available',
      title: 'Nouvel avis disponible',
      body: 'Un avis sur ta dernière mission Jibli est maintenant visible.',
      relatedObjectType: 'travel_request',
      relatedObjectId: requestId,
    })
  }

  revalidatePath(`/jibli/${requestId}`)
  revalidatePath('/profil')
  return { error: null }
}
