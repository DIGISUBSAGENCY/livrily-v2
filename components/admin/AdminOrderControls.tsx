'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrderStatusAdmin, assignDeliveryStaffAdmin } from '@/app/(admin)/admin/commandes/actions'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import type { CommerceDeliveryStaff, OrderStatus } from '@/types/database'

const statusOptions: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'En attente' },
  { value: 'accepted', label: 'Acceptée' },
  { value: 'ready', label: 'Prête' },
  { value: 'delivering', label: 'En livraison' },
  { value: 'delivered', label: 'Livrée' },
  { value: 'cancelled', label: 'Annulée' },
]

interface AdminOrderControlsProps {
  orderId: string
  currentStatus: OrderStatus
  currentStaffId: string | null
  staff: CommerceDeliveryStaff[]
}

// Overrides admin : forcer le statut (l'admin est exempté de la séquence
// stricte imposée au commerce, cf. actions.ts) et assigner/retirer le
// personnel de livraison interne du commerce en cas de besoin.
export function AdminOrderControls({ orderId, currentStatus, currentStaffId, staff }: AdminOrderControlsProps) {
  const router = useRouter()
  const [status, setStatus] = useState<OrderStatus>(currentStatus)
  const [staffId, setStaffId] = useState(currentStaffId ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStatusUpdate() {
    setError(null)
    startTransition(async () => {
      const result = await updateOrderStatusAdmin(orderId, status)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleStaffUpdate() {
    setError(null)
    startTransition(async () => {
      const result = await assignDeliveryStaffAdmin(orderId, staffId || null)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="admin_status">Forcer le statut</Label>
        <div className="flex gap-2">
          <select
            id="admin_status"
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus)}
            className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button size="md" disabled={isPending || status === currentStatus} onClick={handleStatusUpdate}>
            Appliquer
          </Button>
        </div>
      </div>

      {staff.length > 0 && (
        <div>
          <Label htmlFor="admin_staff">Personnel de livraison</Label>
          <div className="flex gap-2">
            <select
              id="admin_staff"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Aucun (gérant)</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </select>
            <Button size="md" variant="secondary" disabled={isPending || staffId === (currentStaffId ?? '')} onClick={handleStaffUpdate}>
              Assigner
            </Button>
          </div>
        </div>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
