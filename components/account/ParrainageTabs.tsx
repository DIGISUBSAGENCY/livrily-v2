'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type TabKey = 'parrainage' | 'portefeuille'

interface ParrainageTabsProps {
  defaultTab?: TabKey
  parrainage: ReactNode
  portefeuille: ReactNode
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'parrainage', label: 'Parrainage' },
  { key: 'portefeuille', label: 'Portefeuille' },
]

// Mirror de ProfileTabs (même pattern d'onglets sous-ligne, déjà établi
// dans ce projet) — chantier portefeuille interne, brique 4/N : les
// sections Parrainage et Portefeuille (briques 1-3/N), jusque-là empilées
// verticalement sur une seule page, séparées ici en deux onglets distincts.
// Contenu passé en ReactNode (comme ProfileTabs.overview) : /parrainage/
// page.tsx reste un Server Component, ce composant ne fait que basculer
// l'affichage, sans re-fetcher quoi que ce soit.
export function ParrainageTabs({ defaultTab = 'parrainage', parrainage, portefeuille }: ParrainageTabsProps) {
  const [tab, setTab] = useState<TabKey>(defaultTab)

  return (
    <div className="mt-6">
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {tab === 'parrainage' && parrainage}
        {tab === 'portefeuille' && portefeuille}
      </div>
    </div>
  )
}
