'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateFlouciPayment, isFlouciConfigured, tndToMillimes, FlouciConfigError, FlouciApiError } from '@/lib/flouci'
import { getSiteUrl } from '@/lib/site'

export interface WalletDepositActionState {
  error: string | null
}

export interface ActionResult {
  error: string | null
}

// Dépôt par virement — chantier portefeuille interne, brique 1/N. Insert
// direct (pas de RPC) : contrairement à purchaseBoostVirement, aucun autre
// effet de bord n'est nécessaire à la soumission (le crédit de
// wallet_balance n'arrive qu'à la vérification admin, via le trigger
// credit_wallet_balance_on_deposit — cf. schema.sql). Message d'erreur
// générique sur l'insert (pas error.message brut, contrairement à
// purchaseBoostVirement) : ici l'échec viendrait d'une policy RLS/
// contrainte CHECK, pas d'une exception métier lisible comme sur une RPC.
export async function depositWalletVirement(
  _prev: WalletDepositActionState,
  formData: FormData
): Promise<WalletDepositActionState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const amountRaw = formData.get('amount')
  const amount = Number(amountRaw)
  if (!amountRaw || !Number.isFinite(amount) || amount <= 0) {
    return { error: 'Indique un montant valide.' }
  }

  const proofFile = formData.get('payment_proof')
  if (!(proofFile instanceof File) || proofFile.size === 0) {
    return { error: "Merci de joindre une capture d'écran de la preuve de virement." }
  }

  const path = `${user.id}/wallet-deposit-${Date.now()}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(path, proofFile, { contentType: proofFile.type || 'image/jpeg', upsert: true })

  if (uploadError) {
    return { error: "Impossible d'envoyer la preuve de paiement, réessaie." }
  }

  const { error } = await supabase.from('wallet_deposits').insert({
    profile_id: user.id,
    amount,
    payment_method: 'virement',
    payment_proof_url: path,
  })

  if (error) {
    console.error('[parrainage] depositWalletVirement a échoué', {
      message: error.message,
      code: error.code,
    })
    return { error: "Impossible d'enregistrer ce dépôt, réessaie." }
  }

  revalidatePath('/parrainage')
  return { error: null }
}

// Dépôt par Flouci — chantier portefeuille interne, brique 2/N. Mirror de
// initiateFlouciPayment (jibli/[id]/actions.ts) : insère une ligne
// 'awaiting_verification' ICI (montant fixé maintenant, jamais repris
// depuis l'URL de retour — cf. schema.sql), PUIS redirige vers Flouci pour
// ce montant exact. Le crédit réel n'a lieu qu'au callback
// (/api/flouci/wallet-callback), après vérification réelle du paiement.
export async function initiateWalletDepositFlouci(amount: number): Promise<ActionResult> {
  if (!isFlouciConfigured()) {
    return { error: "Le paiement Flouci n'est pas encore configuré. Choisis le virement en attendant." }
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Indique un montant valide.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/parrainage')

  const { data: deposit, error: insertError } = await supabase
    .from('wallet_deposits')
    .insert({ profile_id: user.id, amount, payment_method: 'flouci' })
    .select('id')
    .single()

  if (insertError || !deposit) {
    console.error('[parrainage] initiateWalletDepositFlouci (insert) a échoué', {
      message: insertError?.message,
      code: insertError?.code,
    })
    return { error: "Impossible de démarrer le dépôt, réessaie." }
  }

  const siteUrl = getSiteUrl()

  let paymentLink: string
  try {
    const result = await generateFlouciPayment({
      amount: tndToMillimes(amount),
      trackingId: deposit.id,
      successLink: `${siteUrl}/api/flouci/wallet-callback?deposit_id=${deposit.id}`,
      failLink: `${siteUrl}/api/flouci/wallet-callback?deposit_id=${deposit.id}&result=failed`,
    })
    paymentLink = result.paymentLink
  } catch (err) {
    const message =
      err instanceof FlouciConfigError || err instanceof FlouciApiError
        ? err.message
        : 'Impossible de démarrer le paiement Flouci, réessaie.'
    return { error: message }
  }

  redirect(paymentLink)
}
