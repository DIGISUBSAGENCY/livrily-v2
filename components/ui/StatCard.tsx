import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

type StatCardVariant = 'default' | 'ledger'

interface StatCardProps {
  icon?: LucideIcon
  value: string | number
  label: string
  variant?: StatCardVariant
  // Ledger uniquement : valeur en ambre — réservé aux montants/gains par
  // la direction, jamais utilisé comme simple couleur d'accent générique.
  accent?: boolean
  className?: string
}

// Généralise components/travel/DashboardStatCard.tsx (laissé tel quel,
// encore utilisé par /jibli) en composant partagé réutilisable partout.
// Le branch 'default' reproduit exactement son rendu actuel.
export function StatCard({ icon: Icon, value, label, variant = 'default', accent = false, className }: StatCardProps) {
  if (variant === 'ledger') {
    return (
      <Card variant="ledger" className={cn('flex items-center gap-3', className)}>
        {Icon && <Icon className="h-5 w-5 flex-shrink-0 text-ledger-muted" aria-hidden />}
        <div>
          <p
            className={cn(
              'font-mono text-2xl font-bold tabular-nums',
              accent ? 'text-ledger-amber' : 'text-ledger-text'
            )}
          >
            {value}
          </p>
          <p className="text-sm text-ledger-muted">{label}</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className={cn('flex items-center gap-3', className)}>
      {Icon && <Icon className="h-6 w-6 text-brand-600" aria-hidden />}
      <div>
        <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Card>
  )
}
