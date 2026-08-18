'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Écriture directe (pas de RPC) : contrairement à la soumission client
// (submit_identity_verification, verrouillée côté client), l'admin a déjà
// un accès complet via la policy identity_verifications_update_admin_only
// — même pattern que toggleCommerceActive/toggleUserActive.
export async function approveVerification(verificationId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('identity_verifications')
    .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejection_reason: null })
    .eq('id', verificationId)
    .eq('status', 'pending')

  if (error) {
    console.error('[admin/verifications] approveVerification a échoué', { message: error.message, code: error.code })
    return { error: 'Impossible de valider cette vérification, réessaie.' }
  }

  revalidatePath('/admin/verifications')
  revalidatePath('/admin')
  return { error: null }
}

export async function rejectVerification(verificationId: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) {
    return { error: 'Une raison est requise pour rejeter une vérification.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('identity_verifications')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(), rejection_reason: reason.trim() })
    .eq('id', verificationId)
    .eq('status', 'pending')

  if (error) {
    console.error('[admin/verifications] rejectVerification a échoué', { message: error.message, code: error.code })
    return { error: 'Impossible de rejeter cette vérification, réessaie.' }
  }

  revalidatePath('/admin/verifications')
  revalidatePath('/admin')
  return { error: null }
}
