import Link from 'next/link'
import { Plane, Weight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { TripStatusBadge } from '@/components/travel/TripStatusBadge'
import { formatTND } from '@/lib/format'
import type { Trip } from '@/types/database'

interface TripCardProps {
  trip: Trip
  // Récupérés en un seul appel batché par la page listing
  // (get_public_profile_summaries), pas par carte — cf.
  // app/(client)/jibli/trips/page.tsx.
  ownerName: string | null
  ownerAvatarUrl: string | null
}

// Pas de photo/estimation de gain contrairement à RequestCard — un trip
// n'a pas ces concepts (pas d'objet précis tant qu'aucune mise en
// relation n'existe).
export function TripCard({ trip, ownerName, ownerAvatarUrl }: TripCardProps) {
  return (
    <Link href={`/jibli/trips/${trip.id}`} className="group block h-full">
      <Card interactive className="flex h-full flex-col gap-2">
        {/* Groupé (space-y-0.5, serré) : signature "qui propose" avec la
            route/le statut — le gap-2 du conteneur ne s'applique QU'ENTRE
            ce groupe et les lignes date/poids/prix ci-dessous, pas la même
            cadence que le reste. */}
        <div className="space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Plane className="h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
              <p className="font-medium text-slate-900 transition-colors group-hover:text-brand-700">
                {trip.origin_country} → {trip.destination_city}
              </p>
            </div>
            {trip.status !== 'open' && <TripStatusBadge status={trip.status} />}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar fullName={ownerName} avatarUrl={ownerAvatarUrl} size="sm" />
            <p className="min-w-0 truncate text-sm text-slate-600">{ownerName ?? 'Voyageur'}</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">{new Date(trip.travel_date).toLocaleDateString('fr-TN')}</p>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <Weight className="h-3.5 w-3.5" aria-hidden /> {trip.available_weight_kg} kg disponibles
        </p>
        {trip.indicative_price !== null && (
          <p className="text-sm font-medium text-brand-700">À partir de {formatTND(trip.indicative_price)} (indicatif)</p>
        )}
      </Card>
    </Link>
  )
}
