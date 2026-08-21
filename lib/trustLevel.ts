export interface TrustLevel {
  percent: number
  label: string
}

// Mêmes 2 critères que la card "Vérifications" de /profil (lib/profileStats.ts
// + ProfileOverview.tsx) — cohérence volontaire entre les deux pages plutôt
// que d'inventer un 3e calcul. Pas de valeur hardcodée : 0/50/100 dérivés
// directement de l'état réel du compte.
export function computeTrustLevel(emailVerified: boolean, kycVerified: boolean): TrustLevel {
  const completed = (emailVerified ? 1 : 0) + (kycVerified ? 1 : 0)
  const percent = Math.round((completed / 2) * 100)

  let label: string
  if (completed === 0) label = 'Non commencé'
  else if (completed === 1) label = 'En cours'
  else label = 'Vérifié'

  return { percent, label }
}
