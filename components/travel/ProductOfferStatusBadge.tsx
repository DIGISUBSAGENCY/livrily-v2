import { Badge } from '@/components/ui/Badge'
import type { ProductOfferStatus } from '@/types/database'

const statusConfig: Record<ProductOfferStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  open: { label: 'Disponible', tone: 'success' },
  matched: { label: 'Prise', tone: 'info' },
  completed: { label: 'Terminée', tone: 'neutral' },
  cancelled: { label: 'Annulée', tone: 'danger' },
}

export function ProductOfferStatusBadge({ status }: { status: ProductOfferStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
