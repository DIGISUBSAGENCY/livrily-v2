import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type AlertTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface AlertProps {
  tone?: AlertTone
  icon?: LucideIcon
  title?: string
  children?: ReactNode
  className?: string
}

// Même palette sémantique que Badge (components/ui/Badge.tsx) — success/
// warning/danger/info portent déjà un sens précis ailleurs dans l'app,
// pas de raison d'en inventer une autre pour les bandeaux d'alerte.
// Remplace les boîtes ambre/rouge/bleu réinventées à la main dans une
// dizaine de fichiers (IdentityBanner, ResubmitPaymentProof, /login,
// PaymentFlouci/Virement, DeliveryPositionSender, ProposalCard...) —
// jamais factorisées jusqu'ici alors que Badge, lui, l'était déjà.
const toneClasses: Record<AlertTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  success: 'border-brand-200 bg-brand-50 text-brand-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
}

export function Alert({ tone = 'neutral', icon: Icon, title, children, className }: AlertProps) {
  return (
    <div className={cn('rounded-lg border p-4 text-sm', toneClasses[tone], className)}>
      <div className="flex items-start gap-3">
        {Icon && <Icon className="h-5 w-5 flex-shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
        </div>
      </div>
    </div>
  )
}
