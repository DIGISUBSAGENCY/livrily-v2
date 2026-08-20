import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface ProfileStats {
  confirmedDeliveries: number
  activeRequests: number
}

// "Livraisons confirmées" agrégeait à l'origine 3 sources (commandes
// commerce livrées + demandes crowd-shipping reçues côté client +
// livraisons faites en tant que voyageur) — la source commerce (`orders`)
// a disparu avec le rôle commerce, il ne reste que les 2 sources Jibli.
// "Demandes actives" : les demandes encore ouvertes/en cours publiées par
// l'utilisateur.
export async function getProfileStats(supabase: SupabaseClient<Database>, userId: string): Promise<ProfileStats> {
  const [requestsCompletedAsClient, acceptedProposals, activeRequests] = await Promise.all([
    supabase.from('travel_requests').select('id', { count: 'exact', head: true }).eq('client_id', userId).eq('status', 'completed'),
    supabase.from('travel_proposals').select('request_id').eq('voyageur_id', userId).eq('status', 'accepted'),
    supabase
      .from('travel_requests')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', userId)
      .in('status', ['open', 'matched', 'in_transit']),
  ])

  // Deux temps, comme app/(client)/jibli/mes-propositions/page.tsx (pas de
  // filtre embarqué PostgREST sur la table liée) : d'abord les demandes
  // pour lesquelles ma proposition a été acceptée, puis lesquelles sont
  // effectivement terminées.
  const acceptedRequestIds = (acceptedProposals.data ?? []).map((p) => p.request_id)
  let deliveredAsVoyageur = 0
  if (acceptedRequestIds.length > 0) {
    const { count } = await supabase
      .from('travel_requests')
      .select('id', { count: 'exact', head: true })
      .in('id', acceptedRequestIds)
      .eq('status', 'completed')
    deliveredAsVoyageur = count ?? 0
  }

  return {
    confirmedDeliveries: (requestsCompletedAsClient.count ?? 0) + deliveredAsVoyageur,
    activeRequests: activeRequests.count ?? 0,
  }
}
