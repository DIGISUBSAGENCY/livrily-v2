'use server'

import { createClient } from '@/lib/supabase/server'
import type { NotificationType, NotificationPriority, NotificationRelatedObjectType } from '@/types/database'

export interface ActionResult {
  error: string | null
}

export interface NotificationRow {
  id: string
  type: NotificationType
  priority: NotificationPriority
  title: string
  body: string | null
  related_object_type: NotificationRelatedObjectType | null
  related_object_id: string | null
  read_at: string | null
  created_at: string
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

// Liste pour le dropdown de la cloche — filtrée par la policy
// notifications_select_own (user_id = auth.uid()), pas besoin de filtrer
// explicitement ici. Rechargée à chaque ouverture du dropdown côté client
// (pas de cache), cohérent avec le reste de l'app (aucun usage de Supabase
// Realtime nulle part — rafraîchissement à l'interaction, pas en direct).
export async function getRecentNotifications(): Promise<NotificationRow[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, priority, title, body, related_object_type, related_object_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[notifications] getRecentNotifications a échoué', { message: error.message })
    return []
  }
  return data ?? []
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)

  if (error) {
    console.error('[notifications] getUnreadNotificationCount a échoué', { message: error.message })
    return 0
  }
  return count ?? 0
}

// Policy notifications_update_own (user_id = auth.uid()) suffit à garantir
// qu'on ne peut marquer comme lue qu'une notification qui nous appartient —
// pas besoin de re-filtrer par user_id ici.
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null)

  if (error) return { error: 'Impossible de marquer cette notification comme lue.' }
  return { error: null }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)

  if (error) return { error: 'Impossible de marquer les notifications comme lues.' }
  return { error: null }
}
