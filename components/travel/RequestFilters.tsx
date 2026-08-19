'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Clock, TrendingUp } from 'lucide-react'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export type RequestSort = 'recent' | 'price_desc' | 'deadline_asc'

interface RequestFiltersProps {
  defaultOrigin: string
  defaultDestination: string
  defaultSoon: boolean
  defaultGoodPrice: boolean
  defaultBudgetMin: string
  defaultBudgetMax: string
  defaultNeededBefore: string
  defaultSort: RequestSort
  // Pays d'origine distincts parmi les demandes ouvertes actuelles — pour
  // proposer des chips de route rapides plutôt qu'une liste figée à la
  // main (s'adapte automatiquement au volume réel).
  availableCountries: string[]
}

function chipClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
    active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
  )
}

export function RequestFilters({
  defaultOrigin,
  defaultDestination,
  defaultSoon,
  defaultGoodPrice,
  defaultBudgetMin,
  defaultBudgetMax,
  defaultNeededBefore,
  defaultSort,
  availableCountries,
}: RequestFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [origin, setOrigin] = useState(defaultOrigin)
  const [destination, setDestination] = useState(defaultDestination)
  const [soon, setSoon] = useState(defaultSoon)
  const [goodPrice, setGoodPrice] = useState(defaultGoodPrice)
  const [budgetMin, setBudgetMin] = useState(defaultBudgetMin)
  const [budgetMax, setBudgetMax] = useState(defaultBudgetMax)
  const [neededBefore, setNeededBefore] = useState(defaultNeededBefore)
  const [sort, setSort] = useState<RequestSort>(defaultSort)
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(defaultBudgetMin || defaultBudgetMax || defaultNeededBefore)
  )

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      const set = (key: string, value: string) => {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      set('origin', origin)
      set('destination', destination)
      set('soon', soon ? '1' : '')
      set('good_price', goodPrice ? '1' : '')
      set('budget_min', budgetMin)
      set('budget_max', budgetMax)
      set('needed_before', neededBefore)
      set('sort', sort === 'recent' ? '' : sort)

      const next = params.toString()
      const current = searchParams.toString()
      if (next !== current) router.push(`${pathname}?${next}`)
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, soon, goodPrice, budgetMin, budgetMax, neededBefore, sort])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setSoon((v) => !v)} className={chipClass(soon)}>
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Départ bientôt
        </button>
        <button type="button" onClick={() => setGoodPrice((v) => !v)} className={chipClass(goodPrice)}>
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Bon prix
        </button>
        {availableCountries.map((country) => (
          <button
            key={country}
            type="button"
            onClick={() => setOrigin((v) => (v === country ? '' : country))}
            className={chipClass(origin === country)}
          >
            {country}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          type="text"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Pays d'origine (ex: France)"
        />
        <Input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Ville de destination (ex: Tunis)"
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as RequestSort)} className="sm:w-48">
          <option value="recent">Plus récentes</option>
          <option value="price_desc">Meilleur budget</option>
          <option value="deadline_asc">Départ le plus proche</option>
        </Select>
      </div>

      <details className="rounded-lg border border-slate-200" open={advancedOpen}>
        <summary
          className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-brand-600 hover:underline"
          onClick={(e) => {
            e.preventDefault()
            setAdvancedOpen((v) => !v)
          }}
        >
          Filtres avancés
        </summary>
        {advancedOpen && (
          <div className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="budget_min">Budget min (TND)</Label>
              <Input
                id="budget_min"
                type="number"
                min={0}
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="budget_max">Budget max (TND)</Label>
              <Input
                id="budget_max"
                type="number"
                min={0}
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="needed_before">Date limite avant le</Label>
              <Input
                id="needed_before"
                type="date"
                value={neededBefore}
                onChange={(e) => setNeededBefore(e.target.value)}
              />
            </div>
          </div>
        )}
      </details>
    </div>
  )
}
