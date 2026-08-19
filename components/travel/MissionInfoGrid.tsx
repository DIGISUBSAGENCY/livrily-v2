import { MapPin, CalendarClock, Wallet, Receipt } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { formatDeadline } from '@/lib/travel/formatDeadline'
import type { GainEstimate } from '@/lib/travel/estimateGain'

interface MissionInfoGridProps {
  originCountry: string
  destinationCity: string
  neededBy: string | null
  budgetMax: number
  // Non nul dès qu'un montant réel existe (proposition du voyageur
  // courant, ou proposition acceptée pour le client) — sinon les tuiles
  // "Récompense"/"Total estimé" retombent sur une estimation dérivée du
  // budget, explicitement labellisée comme telle. Reflète le flow réel :
  // la récompense est proposée par le voyageur puis acceptée par le
  // client, jamais un montant fixé par la plateforme.
  rewardBasis: { itemPrice: number; deliveryFee: number } | null
  gain: GainEstimate
}

function InfoTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof MapPin
  label: string
  value: string
  sub?: string
}) {
  return (
    <Card className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate font-semibold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </Card>
  )
}

export function MissionInfoGrid({ originCountry, destinationCity, neededBy, budgetMax, rewardBasis, gain }: MissionInfoGridProps) {
  const deadline = neededBy ? formatDeadline(neededBy) : null
  const total = rewardBasis ? rewardBasis.itemPrice + rewardBasis.deliveryFee : budgetMax

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <InfoTile icon={MapPin} label="Trajet" value={`${originCountry} → ${destinationCity}`} />

      <InfoTile
        icon={CalendarClock}
        label="Date limite"
        value={deadline ? deadline.dateLabel : 'Flexible'}
        sub={deadline?.countdown}
      />

      <InfoTile
        icon={Wallet}
        label={rewardBasis ? 'Gain voyageur' : 'Récompense suggérée'}
        value={formatTND(gain.amount)}
        sub={rewardBasis ? undefined : 'Estimation — proposée par le voyageur, à confirmer'}
      />

      <InfoTile
        icon={Receipt}
        label="Total estimé"
        value={formatTND(total)}
        sub={
          rewardBasis
            ? `Objet ${formatTND(rewardBasis.itemPrice)} + service ${formatTND(rewardBasis.deliveryFee)}`
            : 'Budget indicatif du client'
        }
      />
    </div>
  )
}
