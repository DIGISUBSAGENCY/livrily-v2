'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Écriture directe (pas de RPC) : la policy disputes_update_admin_only
// (is_admin()) est la vraie frontière de sécurité, pas une vérification
// dupliquée ici — même pattern que verifications/actions.ts.
//
// .eq('status', 'open') dans le WHERE : empêche le double traitement.
// Si le litige est déjà résolu, la clause ne matche aucune ligne, l'update
// est un no-op silencieux côté Postgres — on le détecte via .select()
// (data vide) pour renvoyer une vraie erreur plutôt que de faire croire à
// l'admin que sa résolution a été appliquée.
export async function resolveDispute(disputeId: string, note: string): Promise<ActionResult> {
  if (note.trim().length < 5) {
    return { error: 'Une note de résolution est requise (5 caractères minimum).' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data, error } = await supabase
    .from('disputes')
    .update({
      status: 'resolved',
      resolution_note: note.trim(),
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', disputeId)
    .eq('status', 'open')
    .select('id')

  if (error) {
    console.error('[admin/litiges] resolveDispute a échoué', { message: error.message, code: error.code })
    return { error: 'Impossible de résoudre ce litige, réessaie.' }
  }

  if (!data || data.length === 0) {
    return { error: 'Ce litige est déjà résolu ou introuvable.' }
  }

  revalidatePath('/admin/litiges')
  revalidatePath(`/admin/litiges/${disputeId}`)
  return { error: null }
}
