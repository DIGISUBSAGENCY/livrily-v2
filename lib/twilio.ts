// Client Twilio (WhatsApp / SMS) — Phase 5, Module 4.
//
// ⚠️ IMPORTANT : même avertissement que lib/onesignal.ts et lib/flouci.ts —
// écrit à partir de la documentation publique de l'API Twilio Messages
// (https://www.twilio.com/docs/messaging/api/message-resource), sans
// credentials réels ni test en direct. Vérifie avant mise en prod.
//
// Pas de SDK `twilio` npm installé : un simple appel REST via fetch, comme
// lib/flouci.ts — évite une dépendance supplémentaire pour un client aussi
// simple (un seul endpoint utilisé).
//
// Best-effort : voir le commentaire équivalent dans lib/onesignal.ts, même
// principe — sendWhatsAppOrSms n'échoue jamais visiblement pour l'appelant.

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01'

export class TwilioConfigError extends Error {}

function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    throw new TwilioConfigError('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN non configurés dans .env.local.')
  }
  return { accountSid, authToken }
}

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
}

// Les numéros sont stockés côté app au format tunisien local (8 chiffres,
// éventuellement préfixés +216 — cf. lib/validations/auth.ts) ; Twilio
// attend du E.164 complet.
function toE164Tunisian(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  const local = digits.startsWith('216') ? digits.slice(3) : digits
  return `+216${local}`
}

type MessageChannel = 'whatsapp' | 'sms'

async function sendMessageRaw(to: string, body: string, channel: MessageChannel): Promise<void> {
  const { accountSid, authToken } = getCredentials()
  const from = channel === 'whatsapp' ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM
  if (!from) {
    throw new TwilioConfigError(
      channel === 'whatsapp' ? 'TWILIO_WHATSAPP_FROM non configuré.' : 'TWILIO_SMS_FROM non configuré.'
    )
  }

  const params = new URLSearchParams({
    To: channel === 'whatsapp' ? `whatsapp:${to}` : to,
    From: channel === 'whatsapp' ? `whatsapp:${from}` : from,
    Body: body,
  })

  const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    },
    body: params,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Twilio Messages a échoué (HTTP ${response.status}): ${text}`)
  }
}

// Point d'entrée à utiliser partout dans le reste du code. Essaie WhatsApp
// en premier (canal préféré en Tunisie, cf. discussion Module 4), puis SMS
// si WhatsApp n'est pas configuré mais que le SMS l'est. Ne fait rien si
// aucun des deux n'est configuré, ou si `phone` est vide.
export async function sendWhatsAppOrSms(phone: string | null, body: string): Promise<void> {
  if (!phone || !isTwilioConfigured()) return

  const to = toE164Tunisian(phone)

  try {
    if (process.env.TWILIO_WHATSAPP_FROM) {
      await sendMessageRaw(to, body, 'whatsapp')
    } else if (process.env.TWILIO_SMS_FROM) {
      await sendMessageRaw(to, body, 'sms')
    }
  } catch (error) {
    console.error('[twilio] Échec envoi message :', error)
  }
}
