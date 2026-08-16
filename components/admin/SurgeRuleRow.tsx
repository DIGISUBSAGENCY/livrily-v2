'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteSurgeRule, toggleSurgeRuleActive } from '@/app/(admin)/admin/zones/actions'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { ZoneSurgeRule } from '@/types/database'

const dayLabels = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function SurgeRuleRow({ rule }: { rule: ZoneSurgeRule }) {
  const [isActive, setIsActive] = useState(rule.is_active)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !isActive
    setIsActive(next)
    startTransition(async () => {
      const result = await toggleSurgeRuleActive(rule.zone_id, rule.id, next)
      if (result.error) {
        setIsActive(!next)
        setError(result.error)
      }
    })
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer la règle "${rule.label}" ?`)) return
    startTransition(async () => {
      const result = await deleteSurgeRule(rule.zone_id, rule.id)
      if (result.error) setError(result.error)
    })
  }

  const days = [...rule.days_of_week].sort().map((d) => dayLabels[d]).join(', ')

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {rule.label} · ×{rule.multiplier}
        </p>
        <p className="text-xs text-slate-500">
          {rule.start_time.slice(0, 5)}–{rule.end_time.slice(0, 5)} · {days}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <button type="button" onClick={handleToggle} disabled={isPending} className={cn('flex-shrink-0', isPending && 'opacity-60')}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Inactive'}</Badge>
      </button>

      <button type="button" onClick={handleDelete} className="p-2 text-slate-500 transition-colors hover:text-red-600" aria-label="Supprimer">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
