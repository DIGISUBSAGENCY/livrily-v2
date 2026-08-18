'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Marque une demande de retrait comme payée (virement effectué manuellement
// hors app, comme pour les autres paiements admin). Réservé aux admins (RLS
// withdrawal_requests_update_admin_only, déjà en place dans schema.sql).
// Ne recrédite/débite rien : travel_voyageur_balance() compte déjà 'pending'
// ET 'paid' comme des montants retirés du solde disponible, donc le passage
// pending → paid ne change pas le calcul du solde.
export async function payWithdrawal(withdrawalId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({ status: 'paid', processed_by: user.id, processed_at: new Date().toISOString() })
    .eq('id', withdrawalId)
    .eq('status', 'pending')

  if (error) {
    console.error('[admin/retraits] payWithdrawal a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: 'Impossible de marquer ce retrait comme payé, réessaie.' }
  }

  revalidatePath('/admin/retraits')
  revalidatePath('/admin')
  return { error: null }
}

// Rejette une demande : status → 'rejected'. travel_voyageur_balance()
// n'exclut QUE 'pending' et 'paid' de son calcul — un retrait rejeté n'est
// donc plus compté comme retiré, le montant redevient disponible pour le
// voyageur sans qu'on ait à toucher à quoi que ce soit d'autre.
export async function rejectWithdrawal(withdrawalId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({ status: 'rejected', processed_by: user.id, processed_at: new Date().toISOString() })
    .eq('id', withdrawalId)
    .eq('status', 'pending')

  if (error) {
    console.error('[admin/retraits] rejectWithdrawal a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: 'Impossible de rejeter ce retrait, réessaie.' }
  }

  revalidatePath('/admin/retraits')
  revalidatePath('/admin')
  return { error: null }
}
