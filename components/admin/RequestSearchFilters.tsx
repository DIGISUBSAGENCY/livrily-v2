'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/Select'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouverte' },
  { value: 'matched', label: 'Voyageur trouvé' },
  { value: 'in_transit', label: 'En transit' },
  { value: 'completed', label: 'Terminée' },
  { value: 'cancelled', label: 'Annulée' },
]

interface RequestSearchFiltersProps {
  defaultQuery: string
  defaultStatus: string
  defaultAttention: boolean
}

// Même pattern debounce + URL params que DisputeSearchFilters.tsx /
// FlouciIncidentSearchFilters.tsx, avec en plus la case "Nécessite
// attention" (paiement en attente OU litige ouvert — calculé côté page,
// pas une vraie colonne, cf. commentaire sur AdminDemandesPage).
export function RequestSearchFilters({ defaultQuery, defaultStatus, defaultAttention }: RequestSearchFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(defaultQuery)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (query) params.set('q', query)
      else params.delete('q')

      const next = params.toString()
      const current = searchParams.toString()
      if (next !== current) router.push(`${pathname}?${next}`)
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  function updateStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') params.set('status', value)
    else params.delete('status')
    router.push(`${pathname}?${params.toString()}`)
  }

  function updateAttention(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    if (checked) params.set('attention', '1')
    else params.delete('attention')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Description, client ou voyageur…"
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:col-span-2"
        />
        <Select defaultValue={defaultStatus} onChange={(e) => updateStatus(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          defaultChecked={defaultAttention}
          onChange={(e) => updateAttention(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Nécessite attention (paiement en attente ou litige ouvert)
      </label>
    </div>
  )
}
