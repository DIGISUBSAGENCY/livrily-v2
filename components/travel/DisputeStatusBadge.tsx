import { Badge } from '@/components/ui/Badge'
import type { DisputeStatus } from '@/types/database'

const statusConfig: Record<DisputeStatus, { label: string; tone: 'warning' | 'success' }> = {
  open: { label: 'Ouvert', tone: 'warning' },
  resolved: { label: 'Résolu', tone: 'success' },
}

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
