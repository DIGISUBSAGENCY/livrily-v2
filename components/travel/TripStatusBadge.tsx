import { Badge } from '@/components/ui/Badge'
import type { TripStatus } from '@/types/database'

const statusConfig: Record<TripStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  open: { label: 'Ouvert', tone: 'success' },
  matched: { label: 'Mis en relation', tone: 'info' },
  completed: { label: 'Terminé', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'danger' },
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
