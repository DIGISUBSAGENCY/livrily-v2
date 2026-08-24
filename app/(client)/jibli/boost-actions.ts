'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface BoostActionState {
  error: string | null
}

export type BoostItemType = 'trip' | 'offer'

function detailPath(itemType: BoostItemType, itemId: string): string {
  return itemType === 'trip' ? `/jibli/trips/${itemId}` : `/jibli/offres/${itemId}`
}

function listingPath(itemType: BoostItemType): string {
  return itemType === 'trip' ? '/jibli/trips' : '/jibli/offres'
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
export async function purchaseBoostVirement(
  itemType: BoostItemType,
  itemId: string,
  _prev: BoostActionState,
  formData: FormData
): Promise<BoostActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/login?next=${detailPath(itemType, itemId)}`)

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
  })

  if (error) {
    return { error: error.message || 'Impossible de booster cet item, réessaie.' }
  }

  revalidatePath(listingPath(itemType))
  redirect(detailPath(itemType, itemId))
}
