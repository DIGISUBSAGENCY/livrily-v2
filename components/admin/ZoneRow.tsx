'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteZone, toggleZoneActive } from '@/app/(admin)/admin/zones/actions'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DeliveryZone } from '@/types/database'

export function ZoneRow({ zone }: { zone: DeliveryZone }) {
  const [isActive, setIsActive] = useState(zone.is_active)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !isActive
    setIsActive(next)
    startTransition(async () => {
      const result = await toggleZoneActive(zone.id, next)
      if (result.error) {
        setIsActive(!next)
        setError(result.error)
      }
    })
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer la zone "${zone.name}" ?`)) return
    startTransition(async () => {
      const result = await deleteZone(zone.id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{zone.name}</p>
        <p className="text-sm text-slate-500">
          {formatTND(zone.delivery_fee)}
          {zone.fee_per_km > 0 && ` + ${formatTND(zone.fee_per_km)}/km`} · rayon{' '}
          {(zone.radius_meters / 1000).toFixed(1)} km
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <button type="button" onClick={handleToggle} disabled={isPending} className={cn('flex-shrink-0', isPending && 'opacity-60')}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Inactive'}</Badge>
      </button>

      <Link href={`/admin/zones/${zone.id}`} className="p-2 text-slate-500 transition-colors hover:text-slate-900" aria-label="Modifier">
        <Pencil className="h-4 w-4" />
      </Link>
      <button type="button" onClick={handleDelete} className="p-2 text-slate-500 transition-colors hover:text-red-600" aria-label="Supprimer">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
