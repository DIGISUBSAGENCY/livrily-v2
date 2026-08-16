'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { removeStaff, toggleStaffActive } from '@/app/(commerce)/commerce/equipe/actions'
import { Badge } from '@/components/ui/Badge'
import type { CommerceDeliveryStaff } from '@/types/database'

export function StaffRow({ staff }: { staff: CommerceDeliveryStaff }) {
  const [isActive, setIsActive] = useState(staff.is_active)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next = !isActive
    setIsActive(next)
    startTransition(async () => {
      const result = await toggleStaffActive(staff.id, next)
      if (result.error) setIsActive(!next)
    })
  }

  function handleRemove() {
    if (!window.confirm(`Retirer ${staff.full_name} de l'équipe ?`)) return
    startTransition(() => {
      void removeStaff(staff.id)
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{staff.full_name}</p>
        {staff.phone && <p className="text-sm text-slate-500">{staff.phone}</p>}
      </div>

      <button type="button" onClick={handleToggle} disabled={isPending} className="flex-shrink-0">
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Actif' : 'Inactif'}</Badge>
      </button>

      <button
        type="button"
        onClick={handleRemove}
        className="p-2 text-slate-500 transition-colors hover:text-red-600"
        aria-label="Retirer"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
