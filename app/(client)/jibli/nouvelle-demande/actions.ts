'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { travelRequestSchema } from '@/lib/validations/travel'

export interface TravelRequestFormState {
  error: string | null
}

export async function createTravelRequest(
  _prev: TravelRequestFormState,
  formData: FormData
): Promise<TravelRequestFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/nouvelle-demande')

  const parsed = travelRequestSchema.safeParse({
    item_description: formData.get('item_description'),
    item_url: formData.get('item_url') || undefined,
    origin_country: formData.get('origin_country'),
    destination_city: formData.get('destination_city'),
    budget_max: formData.get('budget_max'),
    needed_by: formData.get('needed_by') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  // uuid généré ici (comme pour les commandes/preuves de virement) pour
  // pouvoir nommer la photo {user_id}/{request_id}.jpg avant l'insert.
  const requestId = randomUUID()
  let itemPhotoUrl: string | null = null

  const photoFile = formData.get('item_photo')
  if (photoFile instanceof File && photoFile.size > 0) {
    const path = `${user.id}/${requestId}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('travel-request-photos')
      .upload(path, photoFile, { contentType: photoFile.type || 'image/jpeg', upsert: false })

    if (uploadError) {
      return { error: "Impossible d'envoyer la photo, réessaie (ou publie sans photo)." }
    }
    itemPhotoUrl = path
  }

  const { error: insertError } = await supabase.from('travel_requests').insert({
    id: requestId,
    client_id: user.id,
    item_description: parsed.data.item_description,
    item_url: parsed.data.item_url ?? null,
    item_photo_url: itemPhotoUrl,
    origin_country: parsed.data.origin_country,
    destination_city: parsed.data.destination_city,
    budget_max: parsed.data.budget_max,
    needed_by: parsed.data.needed_by ?? null,
  })

  if (insertError) {
    return { error: 'Impossible de publier ta demande, réessaie.' }
  }

  redirect(`/jibli/${requestId}`)
}
