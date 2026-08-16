// Client Flouci (paiement carte en ligne, marché tunisien) pour le
// paiement séquestre du crowd-shipping.
//
// ⚠️ IMPORTANT : cette intégration est écrite à partir de la documentation
// publique de l'API Flouci telle que je la connais, mais je n'ai ni
// credentials réels (FLOUCI_APP_TOKEN/FLOUCI_APP_SECRET vides) ni accès à
// l'API pour la tester en direct — contrairement au reste de ce projet où
// chaque flux a été vérifié par des appels réels. Vérifie les noms
// d'endpoints/champs contre https://developers.flouci.com avant mise en
// prod, et teste ce module dès que les credentials seront configurés.
//
// Isolé dans ce fichier pour que ce soit facile à corriger sans toucher au
// reste du flux d'acceptation.

const FLOUCI_API_BASE = 'https://developers.flouci.com/api'

interface GeneratePaymentParams {
  amount: number // en millimes (1 DT = 1000 millimes)
  trackingId: string // id interne pour retrouver la transaction (on utilise proposal_id)
  successLink: string
  failLink: string
}

interface GeneratePaymentResult {
  paymentLink: string
  paymentId: string
}

export class FlouciConfigError extends Error {}
export class FlouciApiError extends Error {}

function getCredentials() {
  const appToken = process.env.FLOUCI_APP_TOKEN
  const appSecret = process.env.FLOUCI_APP_SECRET
  if (!appToken || !appSecret) {
    throw new FlouciConfigError(
      'FLOUCI_APP_TOKEN / FLOUCI_APP_SECRET non configurés dans .env.local.'
    )
  }
  return { appToken, appSecret }
}

export function isFlouciConfigured(): boolean {
  return Boolean(process.env.FLOUCI_APP_TOKEN && process.env.FLOUCI_APP_SECRET)
}

// Génère un lien de paiement Flouci. À appeler depuis un Server Action, puis
// rediriger l'utilisateur vers `paymentLink`.
export async function generateFlouciPayment(params: GeneratePaymentParams): Promise<GeneratePaymentResult> {
  const { appToken, appSecret } = getCredentials()

  const response = await fetch(`${FLOUCI_API_BASE}/generate_payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_token: appToken,
      app_secret: appSecret,
      amount: params.amount,
      accept_card: true,
      session_timeout_secs: 1200,
      success_link: params.successLink,
      fail_link: params.failLink,
      developer_tracking_id: params.trackingId,
    }),
  })

  if (!response.ok) {
    throw new FlouciApiError(`Flouci generate_payment a échoué (HTTP ${response.status}).`)
  }

  const data = (await response.json()) as {
    result?: { link?: string; payment_id?: string }
  }

  if (!data.result?.link || !data.result?.payment_id) {
    throw new FlouciApiError('Réponse Flouci generate_payment inattendue (lien ou payment_id manquant).')
  }

  return { paymentLink: data.result.link, paymentId: data.result.payment_id }
}

// Vérifie l'état réel d'un paiement auprès de Flouci — ne JAMAIS faire
// confiance aux paramètres de l'URL de retour seuls (falsifiables), cet
// appel serveur-à-serveur est la seule source de vérité.
export async function verifyFlouciPayment(paymentId: string): Promise<{ success: boolean; rawStatus: string }> {
  const { appToken, appSecret } = getCredentials()

  const response = await fetch(`${FLOUCI_API_BASE}/verify_payment/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      apppublic: appToken,
      appsecret: appSecret,
    },
  })

  if (!response.ok) {
    throw new FlouciApiError(`Flouci verify_payment a échoué (HTTP ${response.status}).`)
  }

  const data = (await response.json()) as { result?: { status?: string } }
  const rawStatus = data.result?.status ?? 'UNKNOWN'

  return { success: rawStatus === 'SUCCESS', rawStatus }
}

// TND -> millimes (Flouci attend un montant entier en millimes).
export function tndToMillimes(amountTnd: number): number {
  return Math.round(amountTnd * 1000)
}
