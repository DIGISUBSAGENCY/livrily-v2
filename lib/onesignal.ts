// Client OneSignal (notifications push web) — Phase 5, Module 4.
//
// ⚠️ IMPORTANT : comme lib/flouci.ts, cette intégration est écrite à partir
// de la documentation publique de l'API OneSignal (REST API v1
// /notifications) telle que je la connais, mais sans credentials réels
// (NEXT_PUBLIC_ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY vides) ni accès
// pour la tester en direct. Vérifie contre https://documentation.onesignal.com
// avant mise en prod.
//
// Best-effort partout : un push qui échoue (config absente, playerId
// invalide, API en erreur) ne doit JAMAIS faire échouer l'action métier qui
// déclenche la notification (commande créée, statut changé...). C'est la
// différence avec lib/flouci.ts : Flouci bloque un choix de paiement actif
// par le client (échec visible et légitime), alors qu'une notification est
// un effet de bord silencieux — voir sendPushToUser, seul point d'entrée
// recommandé pour le reste du code.

const ONESIGNAL_API_BASE = 'https://onesignal.com/api/v1'

export class OneSignalConfigError extends Error {}

function getCredentials() {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_REST_API_KEY
  if (!appId || !apiKey) {
    throw new OneSignalConfigError(
      'NEXT_PUBLIC_ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY non configurés dans .env.local.'
    )
  }
  return { appId, apiKey }
}

export function isOneSignalConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY)
}

// Envoi brut, réservé à sendPushToUser ci-dessous (qui absorbe les erreurs).
// Ne pas appeler directement depuis une Server Action métier.
async function sendPushRaw(playerId: string, title: string, message: string, url?: string): Promise<void> {
  const { appId, apiKey } = getCredentials()

  const response = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_player_ids: [playerId],
      headings: { fr: title },
      contents: { fr: message },
      ...(url ? { url } : {}),
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OneSignal /notifications a échoué (HTTP ${response.status}): ${text}`)
  }
}

// Point d'entrée à utiliser partout dans le reste du code. `playerId` est
// `profiles.onesignal_player_id` (null si l'utilisateur n'a jamais accepté
// les notifications navigateur, ou si OneSignal n'est pas configuré) — dans
// ce cas la fonction ne fait simplement rien, silencieusement.
export async function sendPushToUser(
  playerId: string | null,
  title: string,
  message: string,
  url?: string
): Promise<void> {
  if (!playerId || !isOneSignalConfigured()) return

  try {
    await sendPushRaw(playerId, title, message, url)
  } catch (error) {
    console.error('[onesignal] Échec envoi notification push :', error)
  }
}
