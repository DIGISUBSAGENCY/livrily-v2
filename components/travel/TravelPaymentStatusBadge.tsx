import { Badge } from '@/components/ui/Badge'
import type { TravelPaymentStatus } from '@/types/database'

const statusConfig: Record<TravelPaymentStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }> = {
  awaiting_verification: { label: 'Paiement en attente de vérification', tone: 'warning' },
  escrowed: { label: 'Paiement séquestré (bloqué par la plateforme)', tone: 'info' },
  released: { label: 'Paiement libéré', tone: 'success' },
  refunded: { label: 'Paiement remboursé', tone: 'neutral' },
  rejected: { label: 'Preuve de virement refusée — renvoie une nouvelle preuve', tone: 'danger' },
}

export function TravelPaymentStatusBadge({ status }: { status: TravelPaymentStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
