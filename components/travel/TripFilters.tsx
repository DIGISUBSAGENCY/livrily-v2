'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

export type TripSort = 'recent' | 'date_asc'

interface TripFiltersProps {
  defaultOrigin: string
  defaultDestination: string
  defaultBefore: string
  defaultSort: TripSort
}

// Version simplifiée de RequestFilters : pas de chips de route rapides ni
// de filtres avancés (budget n'a pas d'équivalent direct côté trip) —
// origine/destination/date/tri suffisent pour une v1, ajoutable plus tard
// si le volume le justifie.
export function TripFilters({ defaultOrigin, defaultDestination, defaultBefore, defaultSort }: TripFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [origin, setOrigin] = useState(defaultOrigin)
  const [destination, setDestination] = useState(defaultDestination)
  const [before, setBefore] = useState(defaultBefore)
  const [sort, setSort] = useState<TripSort>(defaultSort)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      const set = (key: string, value: string) => {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      set('origin', origin)
      set('destination', destination)
      set('before', before)
      set('sort', sort === 'recent' ? '' : sort)

      const next = params.toString()
      const current = searchParams.toString()
      if (next !== current) router.push(`${pathname}?${next}`)
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, before, sort])

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
      <Input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Pays d'origine (ex: France)" />
      <Input
        type="text"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        placeholder="Ville de destination (ex: Tunis)"
      />
      <Input type="date" value={before} onChange={(e) => setBefore(e.target.value)} className="sm:w-40" />
      <Select value={sort} onChange={(e) => setSort(e.target.value as TripSort)} className="sm:w-44">
        <option value="recent">Plus récents</option>
        <option value="date_asc">Départ le plus proche</option>
      </Select>
    </div>
  )
}
