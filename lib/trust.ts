import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Trust System (Phase 3, brique 3/N). get_trust_score()/get_trust_badges()
// (schema.sql) : SECURITY DEFINER, agrégat calculé à la lecture — jamais un
// remplacement de get_profile_rating (lib/reviews.ts), qui reste UN signal
// parmi d'autres consommés en interne par compute_trust_signals().
export type TrustCategory = 'excellent' | 'high_trust' | 'new_member' | 'limited_history'

export type TrustBadge = 'identity_verified' | 'payment_verified' | 'trusted_traveler' | 'top_traveler' | 'reliable_sender'

export interface TrustScore {
  score: number
  category: TrustCategory
}

// Libellés volontairement sans mot négatif, même au palier le plus bas —
// principe déjà établi côté avis/notation : afficher un indicateur
// compréhensible plutôt qu'un chiffre punitif. Catégories affichées,
// jamais le score brut (cf. TrustPanel/ProposalCard).
export const TRUST_CATEGORY_LABELS: Record<TrustCategory, string> = {
  excellent: 'Excellent',
  high_trust: 'Confiance élevée',
  new_member: 'Nouveau membre',
  limited_history: 'Historique limité',
}

// Ton d'affichage partagé (TrustPanel, ProposalCard) : neutre pour
// new_member/limited_history (jamais de rouge/ton punitif, même au palier
// le plus bas), brand pour excellent/high_trust — même renforcement
// positif que le badge "Voyageur vérifié" existant.
export const TRUST_CATEGORY_TONE: Record<TrustCategory, string> = {
  excellent: 'bg-brand-100 text-brand-700',
  high_trust: 'bg-brand-100 text-brand-700',
  new_member: 'bg-slate-100 text-slate-600',
  limited_history: 'bg-slate-100 text-slate-600',
}

export const TRUST_BADGE_LABELS: Record<TrustBadge, string> = {
  identity_verified: 'Identité vérifiée',
  payment_verified: 'Paiement vérifié',
  trusted_traveler: 'Voyageur de confiance',
  top_traveler: 'Voyageur d’élite',
  reliable_sender: 'Expéditeur fiable',
}

// Repli "new_member" (jamais "limited_history") si l'appel échoue/renvoie
// vide — un défaut neutre plutôt qu'un défaut qui pénaliserait
// silencieusement un profil en cas d'erreur réseau/RPC.
export async function getTrustScore(supabase: SupabaseClient<Database>, profileId: string): Promise<TrustScore> {
  const { data } = await supabase.rpc('get_trust_score', { p_profile_id: profileId })
  const row = data?.[0]
  return { score: row?.score ?? 50, category: (row?.category as TrustCategory | undefined) ?? 'new_member' }
}

export async function getTrustBadges(supabase: SupabaseClient<Database>, profileId: string): Promise<TrustBadge[]> {
  const { data } = await supabase.rpc('get_trust_badges', { p_profile_id: profileId })
  return (data ?? []).map((row) => row.badge as TrustBadge)
}
