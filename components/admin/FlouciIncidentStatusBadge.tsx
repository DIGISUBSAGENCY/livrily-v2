import { Badge } from '@/components/ui/Badge'
import type { FlouciIncidentStatus } from '@/types/database'

const statusConfig: Record<FlouciIncidentStatus, { label: string; tone: 'warning' | 'success' }> = {
  unresolved: { label: 'Non résolu', tone: 'warning' },
  resolved: { label: 'Résolu', tone: 'success' },
}

// Même pattern que DisputeStatusBadge.tsx (components/travel/).
export function FlouciIncidentStatusBadge({ status }: { status: FlouciIncidentStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
