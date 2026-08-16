import { formatTND } from '@/lib/format'

interface ProposalAmountsProps {
  itemPrice: number
  deliveryFee: number
}

// Affiche toujours les deux montants séparément, jamais fusionnés en un
// total trompeur : item_price est un remboursement au voyageur (pas une
// commission), delivery_fee est le seul montant sur lequel une commission
// plateforme sera prélevée plus tard (taux à définir en phase admin).
export function ProposalAmounts({ itemPrice, deliveryFee }: ProposalAmountsProps) {
  return (
    <div className="flex gap-6 text-sm">
      <div>
        <p className="text-slate-500">Prix de l&apos;objet</p>
        <p className="font-medium text-slate-900">{formatTND(itemPrice)}</p>
      </div>
      <div>
        <p className="text-slate-500">Frais de service</p>
        <p className="font-medium text-slate-900">{formatTND(deliveryFee)}</p>
      </div>
    </div>
  )
}
