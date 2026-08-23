import Link from 'next/link'
import { cn } from '@/lib/utils'

export type MarketplaceType = 'trips' | 'offres'

interface MarketplaceTypeTabsProps {
  type: MarketplaceType
  // Query string des AUTRES params (q, status) à préserver en changeant
  // d'onglet — piloté par l'URL comme le reste de cette page (?type=),
  // pas un useState local comme ProposalsTabs.tsx : lien copiable/
  // partageable vers un onglet précis, survit au refresh.
  preservedQuery: string
}

const TABS: { value: MarketplaceType; label: string }[] = [
  { value: 'trips', label: 'Trips' },
  { value: 'offres', label: 'Offres' },
]

export function MarketplaceTypeTabs({ type, preservedQuery }: MarketplaceTypeTabsProps) {
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const params = new URLSearchParams(preservedQuery)
        params.set('type', tab.value)
        return (
          <Link
            key={tab.value}
            href={`/admin/marketplace?${params.toString()}`}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              type === tab.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
