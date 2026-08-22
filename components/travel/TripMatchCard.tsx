'use client'

import { useState, useTransition } from 'react'
import { Plane, Weight } from 'lucide-react'
import { expressInterestInTrip } from '@/app/(client)/jibli/[id]/actions'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatTND } from '@/lib/format'

interface TripMatchCardProps {
  requestId: string
  tripId: string
  originCountry: string
  destinationCity: string
  travelDate: string
  availableWeightKg: number
  indicativePrice: number | null
  score: number
}

// Bouton "Signaler mon intérêt" — ne crée PAS de travel_proposals (le
// client ne peut pas, RLS), notifie juste le voyageur (REQUEST_MATCHED).
// C'est lui qui, depuis son propre trip, verra la demande et pourra
// "Proposer" — cf. le commentaire détaillé sur expressInterestInTrip.
export function TripMatchCard({
  requestId,
  tripId,
  originCountry,
  destinationCity,
  travelDate,
  availableWeightKg,
  indicativePrice,
  score,
}: TripMatchCardProps) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await expressInterestInTrip(requestId, tripId)
      if (result.error) setError(result.error)
      else setSent(true)
    })
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <Plane className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
        <div>
          <p className="text-sm font-medium text-slate-900">
            {originCountry} → {destinationCity}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Date(travelDate).toLocaleDateString('fr-TN')} ·{' '}
            <span className="inline-flex items-center gap-1">
              <Weight className="h-3 w-3" aria-hidden /> {availableWeightKg} kg
            </span>
            {indicativePrice !== null && <> · {formatTND(indicativePrice)} indicatif</>}
          </p>
          {score >= 90 && <p className="mt-0.5 text-xs font-medium text-brand-600">Très bonne correspondance</p>}
        </div>
      </div>

      {sent ? (
        <span className="text-xs font-medium text-brand-600">Intérêt signalé</span>
      ) : (
        <Button size="sm" variant="secondary" onClick={handleClick} disabled={isPending}>
          {isPending ? 'Envoi…' : 'Signaler mon intérêt'}
        </Button>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </Card>
  )
}
