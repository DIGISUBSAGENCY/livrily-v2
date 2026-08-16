import { Badge } from '@/components/ui/Badge'
import type { WithdrawalStatus } from '@/types/database'

const statusConfig: Record<WithdrawalStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'En attente de traitement', tone: 'warning' },
  paid: { label: 'Payé', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
}

export function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
