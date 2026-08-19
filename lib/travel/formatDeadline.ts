// Countdown générique réutilisé partout où une date limite/d'expiration
// s'affiche (MissionInfoGrid "Date limite", ProposalCard "Expire dans") —
// même vocabulaire dans toute l'app plutôt que de le reformuler à chaque
// composant.
export function formatDeadline(dateIso: string) {
  const target = new Date(dateIso)
  const diffDays = Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const dateLabel = target.toLocaleDateString('fr-TN')
  let countdown: string
  if (diffDays < 0) countdown = 'Dépassée'
  else if (diffDays === 0) countdown = "Aujourd'hui"
  else if (diffDays === 1) countdown = 'Demain'
  else countdown = `Dans ${diffDays} jours`
  return { dateLabel, countdown }
}
