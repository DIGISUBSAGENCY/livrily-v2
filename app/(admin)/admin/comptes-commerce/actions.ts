'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Lie un commerce à un compte utilisateur (le rend "commerce") :
//   - si un profil existe déjà avec cet email, on le promeut role='commerce'
//   - sinon on crée le compte via l'API admin (service_role) et on l'invite
//     par email (Supabase envoie l'invitation si le SMTP du projet est
//     configuré) — le trigger handle_new_user crée son profil automatiquement
// La promotion de rôle passe par le client "normal" (pas admin) : is_admin()
// exempte déjà l'appelant du trigger anti-auto-promotion, pas besoin de
// contourner RLS pour ça.
export async function linkCommerceOwner(
  commerceId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return { error: 'Email invalide.' }
  }

  const supabase = await createClient()

  const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle()

  let userId: string
  if (existing) {
    userId = existing.id
  } else {
    const adminClient = createAdminClient()
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)
    if (inviteError || !invited.user) {
      return { error: `Impossible de créer/inviter ce compte : ${inviteError?.message ?? 'erreur inconnue'}` }
    }
    userId = invited.user.id
  }

  const { error: roleError } = await supabase.from('profiles').update({ role: 'commerce' }).eq('id', userId)
  if (roleError) {
    return { error: 'Impossible de promouvoir ce compte.' }
  }

  const { error: linkError } = await supabase.from('commerces').update({ owner_id: userId }).eq('id', commerceId)
  if (linkError) {
    // Contrainte unique commerces_owner_unique_idx : ce compte gère déjà un autre commerce.
    return { error: 'Impossible de lier ce compte (il gère peut-être déjà un autre commerce).' }
  }

  revalidatePath('/admin/comptes-commerce')
  revalidatePath('/admin/commerces')
  return { error: null }
}

export async function unlinkCommerceOwner(commerceId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('commerces').update({ owner_id: null }).eq('id', commerceId)

  if (error) {
    return { error: 'Impossible de délier ce compte.' }
  }

  revalidatePath('/admin/comptes-commerce')
  revalidatePath('/admin/commerces')
  return { error: null }
}
