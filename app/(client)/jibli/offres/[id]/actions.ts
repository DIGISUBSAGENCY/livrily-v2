'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { acceptProposalVirement, initiateFlouciPayment, type ActionResult } from '@/app/(client)/jibli/[id]/actions'
import { getIdentityStatus, isIdentityVerified } from '@/lib/identity'

export interface ProductOfferActionState {
  error: string | null
}

// Prise d'une offre par virement — délègue take_product_offer() (crée la
// demande/proposition, flip l'offre à 'matched') PUIS l'intégralité de
// acceptProposalVirement() EXISTANTE ([id]/actions.ts, upload preuve +
// accept_travel_proposal) sans la réimplémenter : le double contrôle
// d'identité qu'elle refait est un doublon inoffensif, pas un problème à
// éviter à tout prix.
export async function takeProductOfferVirement(
  offerId: string,
  _prev: ProductOfferActionState,
  formData: FormData
): Promise<ProductOfferActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/offres/${offerId}`)

  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: "Vérifie ton identité avant de prendre cette offre (page Profil)." }
  }

  const { data: takeResult, error: takeError } = await supabase.rpc('take_product_offer', { p_offer_id: offerId })
  const row = takeResult?.[0]

  if (takeError || !row) {
    return { error: takeError?.message || "Impossible de prendre cette offre, réessaie." }
  }

  // Réutilise acceptProposalVirement telle quelle (upload preuve, appel
  // accept_travel_proposal). requestId/proposalId viennent d'être créés par
  // take_product_offer() ci-dessus, sinon même chemin qu'une acceptation
  // classique.
  const result: ActionResult = await acceptProposalVirement(row.request_id, row.proposal_id, { error: null }, formData)
  if (result.error) return result

  redirect(`/jibli/${row.request_id}`)
}

// Prise d'une offre par Flouci — même logique : take_product_offer()
// d'abord, puis délégation intégrale à initiateFlouciPayment() EXISTANTE,
// qui génère le lien de paiement et redirige. Le paiement réel n'est
// écrit en base que par le callback Flouci (/api/flouci/travel-callback),
// après confirmation — comportement inchangé, aucune modification du
// callback nécessaire (il ne connaît que requestId/proposalId, pas leur
// origine).
export async function takeProductOfferFlouci(offerId: string): Promise<ProductOfferActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=/jibli/offres/${offerId}`)

  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: "Vérifie ton identité avant de prendre cette offre (page Profil)." }
  }

  const { data: takeResult, error: takeError } = await supabase.rpc('take_product_offer', { p_offer_id: offerId })
  const row = takeResult?.[0]

  if (takeError || !row) {
    return { error: takeError?.message || "Impossible de prendre cette offre, réessaie." }
  }

  // initiateFlouciPayment redirige elle-même en cas de succès (ne revient
  // jamais normalement) ; ne renvoie un résultat que si la génération du
  // lien échoue.
  const result = await initiateFlouciPayment(row.request_id, row.proposal_id)
  return result ?? { error: null }
}

// Annulation par le voyageur propriétaire — update direct (pas de RPC) :
// contrairement à travel_requests, product_offers n'a pas de trigger de
// transition à respecter, la policy product_offers_update_own_or_admin
// suffit. .eq('status', 'open') : on ne peut annuler qu'une offre encore
// disponible, jamais une déjà prise (matched) — cohérent avec
// take_product_offer() qui a déjà flip le statut à ce moment-là.
export async function cancelProductOffer(offerId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_offers')
    .update({ status: 'cancelled' })
    .eq('id', offerId)
    .eq('status', 'open')
    .select('id')
    .single()

  if (error || !data) {
    return { error: "Impossible d'annuler cette offre (déjà prise, ou déjà annulée)." }
  }

  return { error: null }
}
