import { Badge } from '@/components/ui/Badge'
import type { WalletDepositStatus } from '@/types/database'

const statusConfig: Record<WalletDepositStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  awaiting_verification: { label: 'En attente de vérification', tone: 'warning' },
  credited: { label: 'Crédité', tone: 'success' },
  rejected: { label: 'Rejeté', tone: 'danger' },
}

export function WalletDepositStatusBadge({ status }: { status: WalletDepositStatus }) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
