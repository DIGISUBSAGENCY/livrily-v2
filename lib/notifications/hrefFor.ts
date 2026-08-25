import type { NotificationRow } from '@/lib/notifications/actions'

// Extrait de NotificationBell.tsx (composant 'use client') vers ce fichier
// neutre : une fonction utilitaire exportée depuis un module 'use client'
// n'est PAS appelable depuis un composant serveur (RecentActivity.tsx,
// dashboard) — seuls les composants React traversent la frontière
// client/serveur de Next.js, pas les fonctions ordinaires. Confirmé en
// testant en direct ("hrefFor is not a function" côté serveur). Partagée
// ici pour que la cloche ET l'aperçu dashboard l'utilisent telle quelle,
// sans duplication.
export function hrefFor(notification: NotificationRow): string | null {
  if (!notification.related_object_id) return null
  if (notification.related_object_type === 'travel_request') return `/jibli/${notification.related_object_id}`
  if (notification.related_object_type === 'identity_verification') return '/profil/verification-identite'
  return null
}
