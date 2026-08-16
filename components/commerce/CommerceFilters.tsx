'use client'

// Filtres pilotés par l'URL (searchParams) : la page /commerces reste un
// Server Component qui refait la requête Supabase à chaque changement,
// pas besoin de state/fetch côté client pour la liste elle-même.
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommerceCategory } from '@/types/database'

const categories: { value: CommerceCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'supermarche', label: 'Supermarché' },
  { value: 'boulangerie', label: 'Boulangerie' },
  { value: 'fruits_legumes', label: 'Fruits & légumes' },
  { value: 'pharmacie', label: 'Pharmacie' },
]

export function CommerceFilters({ defaultQuery }: { defaultQuery: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeCategory = searchParams.get('category') ?? 'all'
  const [query, setQuery] = useState(defaultQuery)

  function updateParams(next: { category?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    router.push(`${pathname}?${params.toString()}`)
  }

  // Debounce de la recherche texte pour ne pas naviguer à chaque frappe.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query !== (searchParams.get('q') ?? '')) {
        updateParams({ q: query || undefined })
      }
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un commerce…"
          className="h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => updateParams({ category: cat.value === 'all' ? undefined : cat.value })}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              activeCategory === cat.value
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  )
}
