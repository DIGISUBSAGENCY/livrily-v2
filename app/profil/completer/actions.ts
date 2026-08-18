'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { profileSchema } from '@/lib/validations/auth'
import type { UserRole } from '@/types/database'

export interface ProfileFormState {
  error: string | null
}

function roleHome(role: UserRole): string {
  if (role === 'commerce') return '/commerce'
  if (role === 'admin') return '/admin'
  return '/'
}

export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    country: formData.get('country'),
    profession: formData.get('profession'),
    address_lat: formData.get('address_lat'),
    address_lng: formData.get('address_lng'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      address: parsed.data.address,
      country: parsed.data.country,
      profession: parsed.data.profession,
      address_lat: parsed.data.address_lat,
      address_lng: parsed.data.address_lng,
    })
    .eq('id', user.id)

  if (updateError) {
    return { error: "Impossible d'enregistrer ton profil, réessaie." }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: 'Profil enregistré mais impossible de te rediriger, recharge la page.' }
  }

  revalidatePath('/', 'layout')
  redirect(roleHome(profile.role))
}
