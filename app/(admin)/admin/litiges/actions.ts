'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Les 3 fonctions ci-dessous appellent chacune un RPC SECURITY DEFINER
// (resolve_dispute_release_funds/refund/close, schema.sql) — remplacent
// l'ancienne action générique resolveDispute (simple .update() gardé par
// disputes_update_admin_only), retirée : elle ne posait jamais
// resolution_type et permettait de "résoudre" sans distinguer une vraie
// libération de fonds d'un remboursement manuel ou d'une clôture sans
// action. Un seul chemin de résolution désormais, pas deux en parallèle.
//
// Contrairement à resolveDispute, is_admin() n'est PAS la seule frontière
// ici : ces RPC sont SECURITY DEFINER (contournent RLS), donc chaque
// fonction SQL revérifie is_admin() elle-même en première ligne — cette
// action ne fait que relayer l'erreur, jamais de vérification dupliquée
// côté application qui pourrait diverger de la vraie règle en base.
async function callResolveRpc(
  rpcName: 'resolve_dispute_release_funds' | 'resolve_dispute_refund' | 'resolve_dispute_close',
  disputeId: string,
  note: string
): Promise<ActionResult> {
  if (note.trim().length < 5) {
    return { error: 'Une note de résolution est requise (5 caractères minimum).' }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc(rpcName, { p_dispute_id: disputeId, p_note: note.trim() })

  if (error) {
    console.error(`[admin/litiges] ${rpcName} a échoué`, { message: error.message, code: error.code })
    // Les messages du RPC (litige déjà résolu, paiement pas "escrowed",
    // accès refusé...) sont déjà rédigés pour un admin — safe à relayer
    // tels quels, contrairement à d'autres erreurs Postgres internes.
    return { error: error.message }
  }

  revalidatePath('/admin/litiges')
  revalidatePath(`/admin/litiges/${disputeId}`)
  revalidatePath('/admin/demandes')
  return { error: null }
}

export async function resolveDisputeReleaseFunds(disputeId: string, note: string): Promise<ActionResult> {
  return callResolveRpc('resolve_dispute_release_funds', disputeId, note)
}

// Ne déclenche AUCUN remboursement réel — voir resolve_dispute_refund()
// (schema.sql) et le texte du bouton côté UI (DisputeResolutionActions.tsx) :
// documente qu'un remboursement a déjà été fait manuellement par l'admin
// en dehors de Livrily, jamais une action automatique.
export async function resolveDisputeRefund(disputeId: string, note: string): Promise<ActionResult> {
  return callResolveRpc('resolve_dispute_refund', disputeId, note)
}

export async function resolveDisputeClose(disputeId: string, note: string): Promise<ActionResult> {
  return callResolveRpc('resolve_dispute_close', disputeId, note)
}
