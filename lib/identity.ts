import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, IdentityVerificationStatus } from '@/types/database'

// 'unverified' distingue "aucune ligne en base" (jamais soumis) des trois
// statuts réels de identity_verifications — sans lui, un aucune-soumission
// serait indistinguable d'un statut manquant par erreur.
export type IdentityGateStatus = 'unverified' | IdentityVerificationStatus

// Prend un client déjà créé plutôt que d'en instancier un en interne : les
// appelants (dashboard, gates de Server Actions) ont presque toujours déjà
// leur propre `supabase` en main pour d'autres requêtes dans le même appel —
// éviter d'en recréer un second.
export async function getIdentityStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<IdentityGateStatus> {
  const { data } = await supabase
    .from('identity_verifications')
    .select('status')
    .eq('profile_id', userId)
    .maybeSingle()

  return data?.status ?? 'unverified'
}

export function isIdentityVerified(status: IdentityGateStatus): boolean {
  return status === 'approved'
}
