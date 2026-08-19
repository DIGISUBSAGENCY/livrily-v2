export type TravelTrend = 'hot' | 'cold' | null

// 🔥 : au moins 2 propositions reçues dans les dernières 48h (forte
// demande réelle, pas juste "récemment publiée"). ❄️ : publiée depuis au
// moins 7 jours sans aucune proposition. Rien entre les deux — le cas
// normal ne mérite pas d'icône.
export function getTravelTrend(createdAt: string, totalProposals: number, recentProposals: number): TravelTrend {
  if (recentProposals >= 2) return 'hot'
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays >= 7 && totalProposals === 0) return 'cold'
  return null
}
