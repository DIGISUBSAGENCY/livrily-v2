// Point d'entrée à utiliser depuis les Server Actions qui déclenchent une
// notification pour UN AUTRE utilisateur (ex: le client notifie le
// voyageur). Appelle create_notification() (schema.sql) via le client
// service_role — cette RPC n'a explicitement AUCUN grant à `authenticated`,
// donc le client normal ne peut pas l'appeler.
//
// Best-effort, comme sendPushToUser (lib/onesignal.ts) : une notification
// qui échoue (erreur RPC, réseau...) ne doit JAMAIS faire échouer l'action
// métier qui la déclenche (paiement vérifié, statut avancé...) — c'est un
// effet de bord silencieux, pas une étape bloquante.
import { createAdminClient } from '@/lib/supabase/server'
import type { NotificationType, NotificationPriority, NotificationRelatedObjectType } from '@/types/database'

interface NotifyUserParams {
  userId: string
  type: NotificationType
  title: string
  body?: string
  priority?: NotificationPriority
  relatedObjectType?: NotificationRelatedObjectType
  relatedObjectId?: string
}

export async function notifyUser(params: NotifyUserParams): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('create_notification', {
    p_user_id: params.userId,
    p_type: params.type,
    p_title: params.title,
    p_body: params.body ?? null,
    p_priority: params.priority ?? 'normal',
    p_related_object_type: params.relatedObjectType ?? null,
    p_related_object_id: params.relatedObjectId ?? null,
  })

  if (error) {
    console.error('[notifications] create_notification a échoué', {
      message: error.message,
      code: error.code,
      type: params.type,
    })
  }
}
