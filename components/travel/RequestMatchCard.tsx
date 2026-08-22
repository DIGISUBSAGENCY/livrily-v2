import Link from 'next/link'
import { Package } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatTND } from '@/lib/format'

interface RequestMatchCardProps {
  tripId: string
  requestId: string
  itemDescription: string
  originCountry: string
  destinationCity: string
  budgetMax: number
  itemWeightKg: number | null
  score: number
}

// "Proposer" navigue vers la demande avec ?trip_id=... — c'est la page de
// la DEMANDE (pas celle-ci) qui pré-remplit ProposalForm et crée la
// proposition (createProposal, déjà existant, source_trip_id en plus).
// Pas de nouvelle Server Action de création ici : réutilise entièrement le
// chemin de proposition déjà éprouvé.
export function RequestMatchCard({
  tripId,
  requestId,
  itemDescription,
  originCountry,
  destinationCity,
  budgetMax,
  itemWeightKg,
  score,
}: RequestMatchCardProps) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <Package className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
        <div>
          <p className="text-sm font-medium text-slate-900">{itemDescription}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {originCountry} → {destinationCity} · budget max {formatTND(budgetMax)}
            {itemWeightKg !== null && <> · {itemWeightKg} kg</>}
          </p>
          {score >= 90 && <p className="mt-0.5 text-xs font-medium text-brand-600">Très bonne correspondance</p>}
        </div>
      </div>

      <Link href={`/jibli/${requestId}?trip_id=${tripId}`}>
        <Button size="sm">Proposer</Button>
      </Link>
    </Card>
  )
}
