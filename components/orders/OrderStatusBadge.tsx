import { Badge } from '@/components/ui/Badge'
import type { OrderStatus } from '@/types/database'

const statusConfig: Record<OrderStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  accepted: { label: 'Acceptée', tone: 'info' },
  ready: { label: 'Prête', tone: 'info' },
  delivering: { label: 'En livraison', tone: 'info' },
  delivered: { label: 'Livrée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'danger' },
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
