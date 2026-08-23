'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { productOfferSchema } from '@/lib/validations/travel'
import { getIdentityStatus, isIdentityVerified } from '@/lib/identity'

export interface ProductOfferFormState {
  error: string | null
}

// Même garde-fou que createTravelRequest/createTrip : vérification
// d'identité obligatoire pour publier une offre — cohérence explicitement
// confirmée avec les deux autres parcours (demande, trip), pas une
// extrapolation.
export async function createProductOffer(
  _prev: ProductOfferFormState,
  formData: FormData
): Promise<ProductOfferFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/offres/nouveau')

  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: 'Vérifie ton identité avant de publier une offre (page Profil).' }
  }

  const parsed = productOfferSchema.safeParse({
    item_description: formData.get('item_description'),
    origin_country: formData.get('origin_country'),
    destination_city: formData.get('destination_city'),
    travel_date: formData.get('travel_date'),
    item_price: formData.get('item_price'),
    delivery_fee: formData.get('delivery_fee'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  // uuid généré ici (comme createTravelRequest) pour pouvoir nommer la
  // photo {user_id}/{offer_id}.jpg avant l'insert.
  const offerId = randomUUID()
  let itemPhotoUrl: string | null = null

  const photoFile = formData.get('item_photo')
  if (photoFile instanceof File && photoFile.size > 0) {
    // Même bucket que travel_requests (travel-request-photos) : même usage
    // (photo d'objet, annonce publique), pas de bucket dédié pour ça seul.
    const path = `${user.id}/${offerId}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('travel-request-photos')
      .upload(path, photoFile, { contentType: photoFile.type || 'image/jpeg', upsert: false })

    if (uploadError) {
      return { error: "Impossible d'envoyer la photo, réessaie (ou publie sans photo)." }
    }
    itemPhotoUrl = path
  }

  const { error: insertError } = await supabase.from('product_offers').insert({
    id: offerId,
    voyageur_id: user.id,
    item_description: parsed.data.item_description,
    item_photo_url: itemPhotoUrl,
    origin_country: parsed.data.origin_country,
    destination_city: parsed.data.destination_city,
    travel_date: parsed.data.travel_date,
    item_price: parsed.data.item_price,
    delivery_fee: parsed.data.delivery_fee,
  })

  if (insertError) {
    return { error: "Impossible de publier ton offre, réessaie." }
  }

  redirect(`/jibli/offres/${offerId}`)
}
