import { Badge } from '@/components/ui/Badge'
import type { IdentityGateStatus } from '@/lib/identity'

const statusConfig: Record<IdentityGateStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  unverified: { label: 'Non vérifié', tone: 'neutral' },
  pending: { label: 'En attente', tone: 'warning' },
  approved: { label: 'Vérifié', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
}

export function IdentityStatusBadge({ status }: { status: IdentityGateStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
