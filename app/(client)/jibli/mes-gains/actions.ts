'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Demande toujours le solde total disponible — pas de saisie de montant
// libre côté client. Le trigger enforce_withdrawal_amount revérifie quand
// même en base que le montant ne dépasse jamais le solde réel.
export async function requestWithdrawal(): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data: balance, error: balanceError } = await supabase.rpc('travel_voyageur_balance', {
    p_voyageur_id: user.id,
  })

  if (balanceError) {
    return { error: 'Impossible de calculer ton solde, réessaie.' }
  }
  if (!balance || balance <= 0) {
    return { error: 'Aucun solde disponible pour le moment.' }
  }

  const { error } = await supabase.from('withdrawal_requests').insert({
    voyageur_id: user.id,
    amount: balance,
  })

  if (error) {
    return { error: 'Impossible de créer la demande de retrait, réessaie.' }
  }

  revalidatePath('/jibli/mes-gains')
  return { error: null }
}
