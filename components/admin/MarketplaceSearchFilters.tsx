'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/Select'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'open', label: 'Ouvert' },
  { value: 'matched', label: 'Mis en relation / pris' },
  { value: 'completed', label: 'Terminé' },
  { value: 'cancelled', label: 'Annulé' },
]

interface MarketplaceSearchFiltersProps {
  defaultQuery: string
  defaultStatus: string
}

// Même pattern debounce + searchParams que RequestSearchFilters.tsx —
// une seule boîte de recherche libre (pas origine/destination séparées
// comme sur /jibli/trips et /jibli/offres publiques) : convention admin,
// pas convention listing public. Un seul composant partagé pour les deux
// onglets (Trips/Offres) : trip_status et product_offer_status ont
// exactement les mêmes 4 valeurs (open/matched/completed/cancelled), pas
// besoin de deux variantes.
export function MarketplaceSearchFilters({ defaultQuery, defaultStatus }: MarketplaceSearchFiltersProps) {
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
        placeholder="Voyageur, route ou description…"
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
