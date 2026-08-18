'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/Select'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'active', label: 'Actifs' },
  { value: 'suspended', label: 'Suspendus' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'voyageur', label: 'Voyageurs (a fait du crowd-shipping)' },
]

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nom (A→Z)' },
  { value: 'balance_desc', label: 'Solde (décroissant)' },
  { value: 'created_desc', label: "Date d'inscription (récent)" },
  { value: 'orders_desc', label: 'Nombre de commandes (décroissant)' },
]

interface UserSearchFiltersProps {
  defaultQuery: string
  defaultStatus: string
  defaultType: string
  defaultSort: string
}

// Même pattern debounce + URL params que RequestFilters (components/travel/
// RequestFilters.tsx) pour la recherche texte ; les selects, eux, naviguent
// immédiatement (pas besoin de debounce sur un changement discret).
export function UserSearchFilters({ defaultQuery, defaultStatus, defaultType, defaultSort }: UserSearchFiltersProps) {
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

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nom, téléphone ou email…"
        className="h-11 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:col-span-2"
      />
      <Select defaultValue={defaultStatus} onChange={(e) => updateParam('status', e.target.value)}>
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <Select defaultValue={defaultType} onChange={(e) => updateParam('type', e.target.value)}>
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <Select
        defaultValue={defaultSort}
        onChange={(e) => updateParam('sort', e.target.value)}
        className="sm:col-span-4"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            Trier par : {opt.label}
          </option>
        ))}
      </Select>
    </div>
  )
}
