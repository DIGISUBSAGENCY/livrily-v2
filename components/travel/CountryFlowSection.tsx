'use client'

import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import { CountryFlowMap } from '@/components/travel/CountryFlowMap'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { CountryFlowRow } from '@/lib/countryGeo'

type TabKey = 'articles' | 'demandes'

interface CountryFlowSectionProps {
  articles: CountryFlowRow[]
  demandes: CountryFlowRow[]
}

// "Activité en direct" — flux par pays de départ, 2 onglets. Comptage réel
// (agrégation JS sur les lignes 'open', cf. lib/countryGeo.ts — volume
// actuel trop faible pour justifier un GROUP BY SQL dédié). La carte
// (CountryFlowMap) ne couvre que les pays reconnus ; cette liste couvre
// TOUJOURS tout, y compris les valeurs non reconnues (lat/lng null) —
// jamais de donnée qui disparaît silencieusement entre la carte et la
// liste.
export function CountryFlowSection({ articles, demandes }: CountryFlowSectionProps) {
  const tabs: { key: TabKey; label: string; rows: CountryFlowRow[] }[] = [
    { key: 'articles', label: 'Articles', rows: articles },
    { key: 'demandes', label: 'Demandes', rows: demandes },
  ]
  const [tab, setTab] = useState<TabKey>('articles')
  const current = tabs.find((t) => t.key === tab)!
  const total = current.rows.reduce((sum, r) => sum + r.count, 0)
  const maxCount = Math.max(1, ...current.rows.map((r) => r.count))

  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-1.5 font-semibold text-slate-900">
        <Globe2 className="h-5 w-5 text-brand-600" aria-hidden />
        Activité en direct
      </h2>

      <div className="mt-3 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label} {t.rows.length > 0 && `(${total})`}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {current.rows.length === 0 ? (
          <Card className="py-8 text-center text-sm text-slate-500">
            Aucun{tab === 'articles' ? ' article' : 'e demande'} ouvert{tab === 'articles' ? '' : 'e'} pour l&apos;instant.
          </Card>
        ) : (
          <div className="space-y-4">
            <CountryFlowMap rows={current.rows} />

            <Card className="space-y-2">
              {current.rows.map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <p className="w-36 flex-shrink-0 truncate text-sm text-slate-700">{row.label}</p>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.max(4, (row.count / maxCount) * 100)}%` }}
                    />
                  </div>
                  <p className="w-6 flex-shrink-0 text-right text-sm font-medium text-slate-900">{row.count}</p>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </section>
  )
}
