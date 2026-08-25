'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Vérifie un dépôt : status -> 'credited'. Contrairement à
// verifyBoostPayment (rapprochement comptable a posteriori, le boost tourne
// déjà), c'est ICI que wallet_balance est réellement crédité — via le
// trigger credit_wallet_balance_on_deposit (schema.sql), jamais une
// écriture directe ici. Réservé aux admins (RLS
// wallet_deposits_update_admin_only).
export async function verifyWalletDeposit(depositId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: deposit, error } = await supabase
    .from('wallet_deposits')
    .update({ status: 'credited', verified_by: user.id, verified_at: new Date().toISOString() })
    .eq('id', depositId)
    .eq('status', 'awaiting_verification')
    .select('id')
    .single()

  if (error || !deposit) {
    console.error('[admin/portefeuille-paiements] verifyWalletDeposit a échoué', {
      message: error?.message,
      code: error?.code,
    })
    return { error: 'Impossible de valider ce dépôt, réessaie.' }
  }

  revalidatePath('/admin/portefeuille-paiements')
  return { error: null }
}

// Rejette un dépôt : status -> 'rejected'. Le trigger ne se déclenche que
// sur une transition VERS 'credited' — un rejet ne crédite jamais rien,
// aucune écriture sur wallet_balance à faire ici.
export async function rejectWalletDeposit(depositId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: deposit, error } = await supabase
    .from('wallet_deposits')
    .update({ status: 'rejected', verified_by: user.id, verified_at: new Date().toISOString() })
    .eq('id', depositId)
    .eq('status', 'awaiting_verification')
    .select('id')
    .single()

  if (error || !deposit) {
    console.error('[admin/portefeuille-paiements] rejectWalletDeposit a échoué', {
      message: error?.message,
      code: error?.code,
    })
    return { error: 'Impossible de rejeter ce dépôt, réessaie.' }
  }

  revalidatePath('/admin/portefeuille-paiements')
  return { error: null }
}
