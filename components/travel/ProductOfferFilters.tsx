'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

export type ProductOfferSort = 'recent' | 'date_asc'

interface ProductOfferFiltersProps {
  defaultOrigin: string
  defaultDestination: string
  defaultSort: ProductOfferSort
}

// Mirror de TripFilters — origine/destination/tri suffisent pour une v1,
// pas de filtre "avant le" (contrairement à Trips, la date de disponibilité
// d'une offre est fixe pour un produit précis, moins pertinente à borner).
export function ProductOfferFilters({ defaultOrigin, defaultDestination, defaultSort }: ProductOfferFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [origin, setOrigin] = useState(defaultOrigin)
  const [destination, setDestination] = useState(defaultDestination)
  const [sort, setSort] = useState<ProductOfferSort>(defaultSort)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      const set = (key: string, value: string) => {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      set('origin', origin)
      set('destination', destination)
      set('sort', sort === 'recent' ? '' : sort)

      const next = params.toString()
      const current = searchParams.toString()
      if (next !== current) router.push(`${pathname}?${next}`)
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, sort])

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <Input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Pays d'origine (ex: France)" />
      <Input
        type="text"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        placeholder="Ville de destination (ex: Tunis)"
      />
      <Select value={sort} onChange={(e) => setSort(e.target.value as ProductOfferSort)} className="sm:w-44">
        <option value="recent">Plus récentes</option>
        <option value="date_asc">Disponible au plus tôt</option>
      </Select>
    </div>
  )
}
