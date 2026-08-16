import { Badge } from '@/components/ui/Badge'
import type { TravelRequestStatus } from '@/types/database'

const statusConfig: Record<TravelRequestStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  open: { label: 'Ouverte', tone: 'success' },
  matched: { label: 'Voyageur trouvé', tone: 'info' },
  in_transit: { label: 'En transit', tone: 'info' },
  completed: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
}

export function TravelRequestStatusBadge({ status }: { status: TravelRequestStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
