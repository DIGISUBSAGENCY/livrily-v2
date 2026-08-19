import { TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import type { GainEstimate } from '@/lib/travel/estimateGain'

interface VoyageurGainCardProps {
  rewardBasis: { itemPrice: number; deliveryFee: number } | null
  gain: GainEstimate
}

// Carte détaillée du gain voyageur — distincte de la tuile compacte du
// MissionInfoGrid. N'affiche jamais un montant fixé par la plateforme :
// tant qu'aucune proposition réelle n'existe (la sienne, ou celle acceptée
// par le client), le montant est une SUGGESTION dérivée du budget du
// client, explicitement labellisée comme telle — la récompense réelle est
// celle que le voyageur propose lui-même via "Faire une proposition", et
// qui devient définitive une fois acceptée par le client.
export function VoyageurGainCard({ rewardBasis, gain }: VoyageurGainCardProps) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-brand-600" aria-hidden />
        <h2 className="font-semibold text-slate-900">{rewardBasis ? 'Ton gain' : 'Gain estimé'}</h2>
      </div>

      <p className="mt-3 text-3xl font-bold tracking-tight text-brand-700">{formatTND(gain.amount)}</p>
      <p className="text-sm text-slate-500">+{gain.percentOfItemPrice}% du prix de l&apos;objet</p>

      {rewardBasis && (
        <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>Prix de l&apos;objet (remboursé)</span>
            <span className="font-medium text-slate-900">{formatTND(rewardBasis.itemPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frais de service (ton gain)</span>
            <span className="font-medium text-slate-900">{formatTND(rewardBasis.deliveryFee)}</span>
          </div>
        </div>
      )}

      {!rewardBasis && (
        <p className="mt-3 text-xs text-slate-400">
          Estimation basée sur le budget indiqué par le client. Le montant réel est celui que tu
          proposes toi-même ci-dessous — il devient définitif une fois accepté.
        </p>
      )}
    </Card>
  )
}
