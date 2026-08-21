import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface ProfileRating {
  avgRating: number | null
  reviewCount: number
}

// get_profile_rating() (schema.sql) : SECURITY DEFINER, renvoie uniquement
// l'agrégat (jamais le contenu d'un avis) — c'est la seule façon d'obtenir
// la note d'un profil qui n'est pas déjà une contrepartie (RLS de
// travel_reviews reste contreparties-only pour le contenu individuel).
// `returns table(...)` renvoie 0 ou 1 ligne selon PostgREST — jamais
// d'erreur si le profil n'a aucun avis, juste un tableau vide.
export async function getProfileRating(
  supabase: SupabaseClient<Database>,
  profileId: string
): Promise<ProfileRating> {
  const { data } = await supabase.rpc('get_profile_rating', { p_profile_id: profileId })
  const row = data?.[0]
  return { avgRating: row?.avg_rating ?? null, reviewCount: row?.review_count ?? 0 }
}
