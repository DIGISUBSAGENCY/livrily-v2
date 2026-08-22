import { createClient } from '@/lib/supabase/server'
import { TripMatchCard } from '@/components/travel/TripMatchCard'
import { Card } from '@/components/ui/Card'

// RECOMMANDATION SEULEMENT — get_trip_matches_for_request() n'écrit rien,
// juste un score calculé à la lecture (cf. schema.sql). Affiché uniquement
// au propriétaire de la demande (appelant côté page), pas de contrôle
// d'accès à refaire ici : la RPC elle-même ne fait que lire des trips
// 'open' (publics) + LA demande passée en paramètre.
export async function TripMatchesPanel({ requestId }: { requestId: string }) {
  const supabase = await createClient()
  const { data: matches } = await supabase.rpc('get_trip_matches_for_request', { p_request_id: requestId })

  if (!matches || matches.length === 0) return null

  return (
    <Card className="mt-4">
      <h2 className="mb-1 font-semibold text-slate-900">Trips qui pourraient convenir</h2>
      <p className="mb-3 text-xs text-slate-500">
        Des voyageurs ont annoncé une disponibilité sur cette route. Signale ton intérêt pour qu&apos;ils te
        contactent.
      </p>
      <div className="space-y-2">
        {matches.map((match) => (
          <TripMatchCard
            key={match.trip_id}
            requestId={requestId}
            tripId={match.trip_id}
            originCountry={match.origin_country}
            destinationCity={match.destination_city}
            travelDate={match.travel_date}
            availableWeightKg={match.available_weight_kg}
            indicativePrice={match.indicative_price}
            score={match.score}
          />
        ))}
      </div>
    </Card>
  )
}
