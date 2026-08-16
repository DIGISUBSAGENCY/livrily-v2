import { Badge } from '@/components/ui/Badge'
import type { TravelProposalStatus } from '@/types/database'

const statusConfig: Record<TravelProposalStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  accepted: { label: 'Acceptée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'danger' },
  withdrawn: { label: 'Retirée', tone: 'neutral' },
}

export function TravelProposalStatusBadge({ status }: { status: TravelProposalStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
