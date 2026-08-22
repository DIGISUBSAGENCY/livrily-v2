import Link from 'next/link'
import { Plane, Weight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import type { Trip } from '@/types/database'

// Pas de photo/estimation de gain contrairement à RequestCard — un trip
// n'a pas ces concepts (pas d'objet précis tant qu'aucune mise en
// relation n'existe).
export function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link href={`/jibli/trips/${trip.id}`} className="group block h-full">
      <Card interactive className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
          <p className="font-medium text-slate-900 transition-colors group-hover:text-brand-700">
            {trip.origin_country} → {trip.destination_city}
          </p>
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
