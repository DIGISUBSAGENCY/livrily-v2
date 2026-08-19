import { cn } from '@/lib/utils'
import type { IdentityGateStatus } from '@/lib/identity'

// Pas de progression "réelle" pièce par pièce : la soumission
// (VerificationForm) envoie pièce d'identité + selfie en un seul geste,
// il n'y a pas d'état "1 document sur 2" persisté en base. Le % reflète
// donc l'étape du cycle de vie, pas un remplissage de formulaire — c'est
// la seule progression honnête à afficher avant que l'admin ait tranché.
const PROGRESS_BY_STATUS: Record<IdentityGateStatus, number> = {
  unverified: 0,
  pending: 50,
  rejected: 25,
  approved: 100,
}

const BAR_COLOR_BY_STATUS: Record<IdentityGateStatus, string> = {
  unverified: 'bg-slate-300',
  pending: 'bg-amber-400',
  rejected: 'bg-red-400',
  approved: 'bg-brand-600',
}

const LABEL_BY_STATUS: Record<IdentityGateStatus, string> = {
  unverified: 'Identité non vérifiée',
  pending: 'Vérification en cours',
  rejected: 'Vérification refusée',
  approved: 'Identité vérifiée',
}

interface IdentityProgressBarProps {
  status: IdentityGateStatus
  className?: string
}

export function IdentityProgressBar({ status, className }: IdentityProgressBarProps) {
  const percent = PROGRESS_BY_STATUS[status]

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{LABEL_BY_STATUS[status]}</span>
        <span className="font-medium text-slate-700">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={LABEL_BY_STATUS[status]}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={cn('h-full rounded-full transition-all', BAR_COLOR_BY_STATUS[status])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
