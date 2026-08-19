import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
type BadgeVariant = 'default' | 'ledger'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  // 'ledger' = nouvelle direction visuelle : étiquette rectangulaire à
  // bordure fine plutôt que pastille pleine arrondie (les pills sont un
  // marqueur "générique IA" identifié dans l'audit) — cohérent avec
  // l'esthétique "étiquette bagage/douane" de Ledger.
  variant?: BadgeVariant
}

const toneClasses: Record<BadgeVariant, Record<BadgeTone, string>> = {
  default: {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-brand-100 text-brand-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
  },
  ledger: {
    neutral: 'border border-ledger-line bg-ledger-surface text-ledger-muted',
    success: 'border border-emerald-300 bg-emerald-50 text-emerald-800',
    warning: 'border border-amber-300 bg-amber-50 text-amber-800',
    danger: 'border border-red-300 bg-red-50 text-red-700',
    info: 'border border-blue-300 bg-blue-50 text-blue-700',
  },
}

const shapeClasses: Record<BadgeVariant, string> = {
  default: 'rounded-full px-2.5 py-1',
  ledger: 'rounded-ledger px-2 py-0.5 uppercase tracking-wide',
}

export function Badge({ className, tone = 'neutral', variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium',
        shapeClasses[variant],
        toneClasses[variant][tone],
        className
      )}
      {...props}
    />
  )
}
