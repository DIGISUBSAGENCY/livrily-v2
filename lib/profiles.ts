import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface PublicProfileSummary {
  fullName: string | null
  avatarUrl: string | null
}

// get_public_profile_summaries() (schema.sql) : SECURITY DEFINER, expose
// uniquement nom + avatar — jamais le reste de la ligne profiles (RLS
// standard : own_or_admin / travel_counterparties ne couvrent pas "un
// visiteur qui parcourt une liste publique sans relation établie", c'est
// précisément ce que cette RPC comble). Batché (un seul appel par page de
// listing) plutôt qu'un appel par carte — même souci que les Promise.all
// déjà utilisés pour get_trust_score/get_profile_rating sur /jibli/[id],
// mais ici un aller-retour réseau au lieu de N.
export async function getPublicProfileSummaries(
  supabase: SupabaseClient<Database>,
  profileIds: string[]
): Promise<Map<string, PublicProfileSummary>> {
  const uniqueIds = Array.from(new Set(profileIds))
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase.rpc('get_public_profile_summaries', { p_profile_ids: uniqueIds })

  return new Map(
    (data ?? []).map((row) => [row.id, { fullName: row.full_name, avatarUrl: row.avatar_url }])
  )
}
