'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifyFlouciPayment, FlouciApiError, FlouciConfigError } from '@/lib/flouci'

export interface ActionResult {
  error: string | null
}

// Même pattern que resolveDispute (app/(admin)/admin/litiges/actions.ts) :
// la policy flouci_incidents_update_admin_only (is_admin()) est la vraie
// frontière de sécurité. .eq('status', 'unresolved') dans le WHERE empêche
// le double traitement — si déjà résolu, l'update est un no-op détecté via
// .select() (data vide) et renvoyé comme une vraie erreur.
//
// Cette action N'EFFECTUE AUCUN REMBOURSEMENT NI TRANSFERT : aucune RPC ne
// permet à un admin de rejouer accept_travel_proposal (elle exige
// auth.uid() = client_id) ni de rembourser réellement un paiement Flouci
// (non implémenté, l'intégration Flouci n'a d'ailleurs jamais été testée
// contre l'API réelle — cf. lib/flouci.ts). Elle enregistre uniquement une
// décision administrative tracée (note + qui + quand), cf. ResolutionForm.
export async function resolveFlouciIncident(incidentId: string, note: string): Promise<ActionResult> {
  if (note.trim().length < 5) {
    return { error: 'Une note de résolution est requise (5 caractères minimum).' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { data, error } = await supabase
    .from('flouci_payment_incidents')
    .update({
      status: 'resolved',
      resolution_note: note.trim(),
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', incidentId)
    .eq('status', 'unresolved')
    .select('id')

  if (error) {
    console.error('[admin/flouci-incidents] resolveFlouciIncident a échoué', {
      message: error.message,
      code: error.code,
    })
    return { error: 'Impossible de résoudre cet incident, réessaie.' }
  }

  if (!data || data.length === 0) {
    return { error: 'Cet incident est déjà résolu ou introuvable.' }
  }

  revalidatePath('/admin/flouci-incidents')
  revalidatePath(`/admin/flouci-incidents/${incidentId}`)
  return { error: null }
}

export interface ReverifyResult {
  error: string | null
  rawStatus?: string
  success?: boolean
}

// Re-vérifie le statut réel du paiement auprès de l'API Flouci — exactement
// verifyFlouciPayment(), le même appel serveur-à-serveur que le callback, ne
// jamais faire confiance à une valeur stockée. Pur read : ne modifie ni
// flouci_payment_incidents ni travel_payments, affiche juste le résultat
// brut à l'admin pour éclairer sa décision.
//
// Exception volontaire au pattern "RLS/RPC est la seule frontière" suivi
// ailleurs (resolveDispute, resolveFlouciIncident) : cette action n'écrit
// dans aucune table, donc aucune policy ne peut la protéger — la
// vérification is_admin() doit donc être faite ici, explicitement.
export async function reverifyFlouciIncidentStatus(flouciPaymentId: string): Promise<ReverifyResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié.' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Accès refusé.' }

  try {
    const { success, rawStatus } = await verifyFlouciPayment(flouciPaymentId)
    return { error: null, success, rawStatus }
  } catch (err) {
    if (err instanceof FlouciConfigError) {
      return { error: 'Flouci non configuré (FLOUCI_APP_TOKEN/FLOUCI_APP_SECRET absents) — vérification impossible.' }
    }
    if (err instanceof FlouciApiError) {
      return { error: `L'API Flouci a répondu une erreur : ${err.message}` }
    }
    console.error('[admin/flouci-incidents] reverifyFlouciIncidentStatus a échoué', err)
    return { error: 'Vérification impossible pour le moment.' }
  }
}
