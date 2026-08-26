import { formatTND } from '@/lib/format'
import { cn } from '@/lib/utils'

type PriceSize = 'sm' | 'md' | 'lg'

interface PriceProps {
  amount: number
  size?: PriceSize
  className?: string
}

// Style canonique des montants (refonte v3, vague B) — l'audit Phase 1 a
// relevé 12 traitements différents de formatTND() dans le produit, pour
// l'information la plus importante d'une marketplace. Trois tailles, pas
// plus :
//   sm : lignes de liste / historiques
//   md : cartes de listing (le montant est l'élément dominant de la carte)
//   lg : fiches détail / soldes
const sizeClasses: Record<PriceSize, string> = {
  sm: 'font-semibold text-slate-900',
  md: 'text-xl font-bold tracking-tight text-slate-900',
  lg: 'text-2xl font-bold tracking-tight text-brand-700',
}

export function Price({ amount, size = 'md', className }: PriceProps) {
  return <span className={cn('tabular-nums', sizeClasses[size], className)}>{formatTND(amount)}</span>
}
