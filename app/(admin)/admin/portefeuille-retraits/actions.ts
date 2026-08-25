'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Mirror de payWithdrawal (/admin/retraits) — ne recrédite/débite rien : le
// montant a déjà été débité à la demande (request_wallet_withdrawal, cf.
// schema.sql), le passage pending → paid ne change pas le solde.
export async function payWalletWithdrawal(withdrawalId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('wallet_withdrawals')
    .update({ status: 'paid', processed_by: user.id, processed_at: new Date().toISOString() })
    .eq('id', withdrawalId)
    .eq('status', 'pending')

  if (error) {
    console.error('[admin/portefeuille-retraits] payWalletWithdrawal a échoué', {
      message: error.message,
      code: error.code,
    })
    return { error: 'Impossible de marquer ce retrait comme payé, réessaie.' }
  }

  revalidatePath('/admin/portefeuille-retraits')
  return { error: null }
}

// Mirror de rejectWithdrawal (/admin/retraits) — le trigger
// refund_wallet_balance_on_withdrawal_reject (schema.sql) recrédite
// automatiquement le montant, aucune écriture sur wallet_balance ici.
export async function rejectWalletWithdrawal(withdrawalId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('wallet_withdrawals')
    .update({ status: 'rejected', processed_by: user.id, processed_at: new Date().toISOString() })
    .eq('id', withdrawalId)
    .eq('status', 'pending')

  if (error) {
    console.error('[admin/portefeuille-retraits] rejectWalletWithdrawal a échoué', {
      message: error.message,
      code: error.code,
    })
    return { error: 'Impossible de rejeter ce retrait, réessaie.' }
  }

  revalidatePath('/admin/portefeuille-retraits')
  return { error: null }
}
