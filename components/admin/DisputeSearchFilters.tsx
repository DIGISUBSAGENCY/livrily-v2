'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/Select'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les litiges' },
  { value: 'open', label: 'Ouverts' },
  { value: 'resolved', label: 'Résolus' },
]

interface DisputeSearchFiltersProps {
  defaultQuery: string
  defaultStatus: string
}

// Même pattern debounce + URL params que UserSearchFilters.tsx.
export function DisputeSearchFilters({ defaultQuery, defaultStatus }: DisputeSearchFiltersProps) {
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

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Description de la mission ou raison du litige…"
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
  )
}
