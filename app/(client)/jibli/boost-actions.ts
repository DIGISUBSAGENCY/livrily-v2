'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface BoostActionState {
  error: string | null
}

// 'request' (Phase 3, brique 6/N) : boost sur une demande (travel_requests)
// 'open' — cf. schema.sql pour pourquoi 'matched' est exclu (plus listée
// nulle part).
export type BoostItemType = 'trip' | 'offer' | 'request'

function detailPath(itemType: BoostItemType, itemId: string): string {
  if (itemType === 'trip') return `/jibli/trips/${itemId}`
  if (itemType === 'offer') return `/jibli/offres/${itemId}`
  return `/jibli/${itemId}`
}

function listingPath(itemType: BoostItemType): string {
  if (itemType === 'trip') return '/jibli/trips'
  if (itemType === 'offer') return '/jibli/offres'
  return '/jibli'
}

// Achat d'un boost par virement — un seul point d'entrée pour trip ET
// offer (contrairement à takeProductOfferVirement/acceptProposalVirement,
// qui restent distinctes car leurs logiques métier divergent) : ici
// l'opération déléguée à purchase_boost_virement() (SECURITY DEFINER, cf.
// schema.sql) est réellement identique à un nom de table près. Même schéma
// d'upload de preuve que acceptProposalVirement/takeProductOfferVirement
// (bucket payment-proofs, dossier utilisateur) — nom de fichier horodaté
// (pas un chemin fixe en upsert) car, contrairement à une preuve de
// virement de mission, un boost peut être racheté plusieurs fois pour le
// même item : chaque achat garde SA preuve propre dans boost_payments
// (historique conservé, cf. schema.sql).
//
// Appelle exclusivement la surcharge 4-arg de purchase_boost_virement()
// (tarification par palier, Phase 3 brique 6/N) — l'ancienne 3-arg reste
// intacte côté base (rien ne l'appelle plus depuis ce composant, mais elle
// n'est pas supprimée ici ; cf. schema.sql pour le raisonnement additif).
//
// redirectTo (Phase 3, brique 7/N) : où revenir après l'achat. undefined
// sur les fiches détail (comportement inchangé, revient sur l'item
// lui-même) ; explicitement '/profil/mes-boosts' depuis la page
// centralisée — sans ça, un achat depuis cette page éjecterait
// l'utilisateur vers la fiche détail de CET item au lieu de le laisser sur
// la liste complète.
export async function purchaseBoostVirement(
  itemType: BoostItemType,
  itemId: string,
  redirectTo: string | undefined,
  _prev: BoostActionState,
  formData: FormData
): Promise<BoostActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${redirectTo ?? detailPath(itemType, itemId)}`)

  // Défense en profondeur : la RPC valide de toute façon la durée (grille
  // 1-7 jours), mais un message clair ici évite de laisser remonter une
  // erreur SQL brute si le champ manque/n'est pas numérique (select
  // manipulé côté client, JS désactivé...).
  const durationDaysRaw = formData.get('duration_days')
  const durationDays = Number(durationDaysRaw)
  if (!durationDaysRaw || !Number.isInteger(durationDays) || durationDays < 1) {
    return { error: 'Choisis une durée de mise en avant valide.' }
  }

  const proofFile = formData.get('payment_proof')
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return { error: "Merci de joindre une capture d'écran de la preuve de virement." }
  }

  const path = `${user.id}/boost-${itemType}-${itemId}-${Date.now()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, proofFile, { contentType: proofFile.type || 'image/jpeg', upsert: true })

  if (uploadError) {
    return { error: "Impossible d'envoyer la preuve de paiement, réessaie." }
  }

  const { error } = await supabase.rpc('purchase_boost_virement', {
    p_item_type: itemType,
    p_item_id: itemId,
    p_payment_proof_url: path,
    p_duration_days: durationDays,
  })

  if (error) {
    return { error: error.message || 'Impossible de booster cet item, réessaie.' }
  }

  revalidatePath(listingPath(itemType))
  revalidatePath('/profil/mes-boosts')
  redirect(redirectTo ?? detailPath(itemType, itemId))
}
