import { createClient } from '@/lib/supabase/server'
import { RequestMatchCard } from '@/components/travel/RequestMatchCard'
import { Card } from '@/components/ui/Card'
import type { TrustCategory } from '@/lib/trust'

// Symétrique de TripMatchesPanel côté voyageur — RECOMMANDATION SEULEMENT.
export async function RequestMatchesPanel({ tripId }: { tripId: string }) {
  const supabase = await createClient()
  const { data: matches } = await supabase.rpc('get_request_matches_for_trip', { p_trip_id: tripId })

  if (!matches || matches.length === 0) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-slate-500">Aucune demande ne correspond à ce trip pour l&apos;instant.</p>
      </Card>
    )
  }

  return (
    <Card className="mt-4">
      <h2 className="mb-1 font-semibold text-slate-900">Demandes qui pourraient convenir</h2>
      <p className="mb-3 text-xs text-slate-500">
        Des clients ont une demande sur cette route — propose-leur de t&apos;en charger.
      </p>
      <div className="space-y-2">
        {matches.map((match) => (
          <RequestMatchCard
            key={match.request_id}
            tripId={tripId}
            requestId={match.request_id}
            itemDescription={match.item_description}
            originCountry={match.origin_country}
            destinationCity={match.destination_city}
            budgetMax={match.budget_max}
            itemWeightKg={match.item_weight_kg}
            logisticsScore={match.logistics_score}
            trustCategory={match.trust_category as TrustCategory}
          />
        ))}
      </div>
    </Card>
  )
}
