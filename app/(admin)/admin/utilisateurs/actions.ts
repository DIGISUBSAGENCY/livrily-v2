'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { adminUserCreateSchema, adminUserEditSchema, walletAdjustmentSchema } from '@/lib/validations/adminUser'

export interface ActionResult {
  error: string | null
}

// Suspend/réactive un compte client. RLS profiles_update_own_or_admin
// autorise déjà l'admin à modifier n'importe quel profil ; aucun trigger ne
// bloque is_active (prevent_wallet_self_edit et prevent_role_self_escalation
// ne s'appliquent qu'aux auto-modifications par le même compte, jamais le
// cas ici puisque c'est l'admin qui agit sur le profil d'un autre).
export async function toggleUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId)

  if (error) {
    console.error('[admin/utilisateurs] toggleUserActive a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: 'Impossible de mettre à jour le statut de ce compte, réessaie.' }
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath(`/admin/utilisateurs/${userId}`)
  return { error: null }
}

// Création d'un compte directement par l'admin, sans passer par le flow
// d'inscription self-service (/signup). Mot de passe initial défini par
// l'admin plutôt qu'email d'invitation — cf. discussion : plus simple,
// aucune dépendance à la délivrabilité email (déjà source de plusieurs bugs
// ce mois-ci avec Resend/OTP), le compte est utilisable immédiatement.
//
// createUser() déclenche handle_new_user() (schema.sql) exactement comme un
// signup normal : role='client' par défaut, referral_code généré, full_name
// posé automatiquement depuis user_metadata. phone/address/country/
// profession ne sont PAS gérés par ce trigger (il ne gère que full_name) —
// posés ici par une seconde requête, une fois la ligne profiles garantie
// exister (le trigger AFTER INSERT s'exécute dans la même transaction que
// createUser(), donc déjà commité au moment où l'appel API retourne).
export async function createUserByAdmin(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = adminUserCreateSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    country: formData.get('country'),
    profession: formData.get('profession'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const adminClient = createAdminClient()
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  })

  if (createError || !created.user) {
    console.error('[admin/utilisateurs] createUser a échoué', { message: createError?.message })
    const message =
      createError?.code === 'email_exists'
        ? 'Un compte existe déjà avec cet email.'
        : 'Impossible de créer le compte, réessaie.'
    return { error: message }
  }

  const supabase = await createClient()
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      phone: parsed.data.phone,
      address: parsed.data.address,
      country: parsed.data.country,
      profession: parsed.data.profession,
    })
    .eq('id', created.user.id)

  revalidatePath('/admin/utilisateurs')

  if (updateError) {
    // Le compte auth existe déjà à ce stade (pas de rollback possible côté
    // app, et retourner une "erreur" laisserait l'admin bloqué sur un
    // formulaire de création qui échouerait au prochain essai — l'email est
    // désormais pris). On redirige quand même vers le compte créé, avec un
    // avertissement affiché là-bas plutôt qu'ici.
    console.error('[admin/utilisateurs] createUserByAdmin (update profil) a échoué', {
      message: updateError.message,
      code: updateError.code,
    })
    redirect(`/admin/utilisateurs/${created.user.id}?warning=profil_incomplet`)
  }

  redirect(`/admin/utilisateurs/${created.user.id}`)
}

// Ajustement manuel du solde — passe exclusivement par le RPC
// adjust_wallet_balance (schema.sql), qui vérifie lui-même is_admin() et met
// à jour wallet_balance + trace l'ajustement dans wallet_adjustments en une
// seule transaction. Aucune écriture directe sur profiles.wallet_balance
// ici (justement pour ne jamais pouvoir écraser le solde sans laisser de
// trace, comme demandé).
export async function adjustUserWallet(userId: string, formData: FormData): Promise<ActionResult> {
  const parsed = walletAdjustmentSchema.safeParse({
    amount: formData.get('amount'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('adjust_wallet_balance', {
    p_profile_id: userId,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason,
  })

  if (error) {
    console.error('[admin/utilisateurs] adjustUserWallet a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: "Impossible d'ajuster le solde, réessaie." }
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath(`/admin/utilisateurs/${userId}`)
  return { error: null }
}

// Édition manuelle du profil. L'email est traité à part : profiles.email
// n'est qu'une copie dénormalisée de auth.users.email (posée par
// handle_new_user() à l'inscription) — la modifier seule désynchroniserait
// l'affichage de l'identifiant de connexion réel. On met donc d'abord à
// jour auth.users via l'API Admin (email_confirm: true — appliqué
// immédiatement, sans email de confirmation : correction admin assumée,
// pas un flux self-service) AVANT de toucher profiles, pour ne jamais
// laisser les deux désynchronisés si l'appel Admin API échoue (ex: email
// déjà utilisé par un autre compte).
export async function updateUserProfile(
  userId: string,
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const parsed = adminUserEditSchema.safeParse({
    full_name: formData.get('full_name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    country: formData.get('country'),
    profession: formData.get('profession'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()

  const { data: current } = await supabase.from('profiles').select('email').eq('id', userId).single()

  if (current && current.email !== parsed.data.email) {
    const adminClient = createAdminClient()
    const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
      email: parsed.data.email,
      email_confirm: true,
    })
    if (authError) {
      console.error('[admin/utilisateurs] updateUserById (email) a échoué', { message: authError.message })
      return { error: "Impossible de mettre à jour l'email (peut-être déjà utilisé par un autre compte)." }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      address: parsed.data.address,
      country: parsed.data.country,
      profession: parsed.data.profession,
    })
    .eq('id', userId)

  if (error) {
    console.error('[admin/utilisateurs] updateUserProfile a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: "Impossible d'enregistrer les modifications, réessaie." }
  }

  revalidatePath('/admin/utilisateurs')
  revalidatePath(`/admin/utilisateurs/${userId}`)
  return { error: null }
}
