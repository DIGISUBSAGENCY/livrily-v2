'use server'

import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Appelée par OneSignalInit dès qu'un playerId (identifiant d'abonnement
// push navigateur) est disponible pour l'utilisateur connecté. Écriture sur
// sa propre ligne profiles — déjà autorisée par la policy
// profiles_update_own_or_admin existante, aucune colonne sensible ici
// (contrairement à wallet_balance/referral_*, cf. prevent_wallet_self_edit
// dans schema.sql) donc pas de nouveau garde-fou nécessaire.
export async function saveOneSignalPlayerId(playerId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase.from('profiles').update({ onesignal_player_id: playerId }).eq('id', user.id)

  if (error) return { error: "Impossible d'enregistrer l'abonnement aux notifications." }
  return { error: null }
}
