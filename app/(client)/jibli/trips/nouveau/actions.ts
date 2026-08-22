'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { tripSchema } from '@/lib/validations/travel'
import { getIdentityStatus, isIdentityVerified } from '@/lib/identity'

export interface TripFormState {
  error: string | null
}

// Même garde-fou que createTravelRequest : vérification d'identité
// obligatoire pour publier un trip, cohérence avec la création de demande
// (décidé explicitement, pas une extrapolation) — revérifié ici, pas
// seulement côté UI, l'action reste appelable directement.
export async function createTrip(_prev: TripFormState, formData: FormData): Promise<TripFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/trips/nouveau')

  const identityStatus = await getIdentityStatus(supabase, user.id)
  if (!isIdentityVerified(identityStatus)) {
    return { error: 'Vérifie ton identité avant de publier un trip (page Profil).' }
  }

  const parsed = tripSchema.safeParse({
    origin_country: formData.get('origin_country'),
    destination_city: formData.get('destination_city'),
    travel_date: formData.get('travel_date'),
    available_weight_kg: formData.get('available_weight_kg'),
    indicative_price: formData.get('indicative_price') || undefined,
    pickup_city: formData.get('pickup_city') || undefined,
    message: formData.get('message') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const { data: trip, error: insertError } = await supabase
    .from('trips')
    .insert({
      voyageur_id: user.id,
      origin_country: parsed.data.origin_country,
      destination_city: parsed.data.destination_city,
      travel_date: parsed.data.travel_date,
      available_weight_kg: parsed.data.available_weight_kg,
      indicative_price: parsed.data.indicative_price ?? null,
      pickup_city: parsed.data.pickup_city ?? null,
      message: parsed.data.message ?? null,
    })
    .select('id')
    .single()

  if (insertError || !trip) {
    return { error: 'Impossible de publier ton trip, réessaie.' }
  }

  redirect(`/jibli/trips/${trip.id}`)
}
