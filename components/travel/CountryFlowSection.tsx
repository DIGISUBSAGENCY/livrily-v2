'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Globe2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { CountryFlowRow } from '@/lib/countryGeo'
import { Heading } from '@/components/ui/Typography'

// ssr:false obligatoire : Leaflet touche `window` dès l'import du module,
// incompatible avec le rendu serveur de Next.js App Router. Autorisé ici
// (pas dans un Server Component) car CountryFlowSection est déjà
// 'use client'. Skeleton de chargement à la même hauteur que la carte
// réelle (h-80) pour éviter un saut de layout pendant le chargement du
// chunk.
const CountryFlowMap = dynamic(
  () => import('@/components/travel/CountryFlowMap').then((m) => m.CountryFlowMap),
  {
    ssr: false,
    loading: () => <div className="h-80 w-full animate-pulse rounded-lg border border-slate-200 bg-slate-100" />,
  }
)

type TabKey = 'articles' | 'demandes'

interface CountryFlowSectionProps {
  articles: CountryFlowRow[]
  demandes: CountryFlowRow[]
}

const listingPathByTab: Record<TabKey, string> = {
  articles: '/jibli/offres',
  demandes: '/jibli',
}
const listingLabelByTab: Record<TabKey, string> = {
  articles: 'Voir tous les articles',
  demandes: 'Voir toutes les demandes',
}

// "Activité en direct" — flux par pays de départ, 2 onglets. Comptage réel
// (agrégation JS sur les lignes 'open', cf. lib/countryGeo.ts — volume
// actuel trop faible pour justifier un GROUP BY SQL dédié). La carte
// (CountryFlowMap) ne couvre que les pays reconnus ; les pills couvrent
// TOUJOURS tout, y compris les valeurs non reconnues (lat/lng null) —
// jamais de donnée qui disparaît silencieusement entre la carte et la liste.
export function CountryFlowSection({ articles, demandes }: CountryFlowSectionProps) {
  const tabs: { key: TabKey; label: string; rows: CountryFlowRow[] }[] = [
    { key: 'articles', label: 'Articles', rows: articles },
    { key: 'demandes', label: 'Demandes', rows: demandes },
  ]
  const [tab, setTab] = useState<TabKey>('articles')
  const current = tabs.find((t) => t.key === tab)!
  const total = current.rows.reduce((sum, r) => sum + r.count, 0)

  return (
    <section className="mt-6">
      <Heading level="h3" as="h2" className="flex items-center gap-1.5">
        <Globe2 className="h-5 w-5 text-brand-600" aria-hidden />
        Activité en direct
      </Heading>

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
            <CountryFlowMap rows={current.rows} totalCount={total} />

            {/* Pills — remplace l'ancienne liste à barres. wrap natif
                (flex-wrap) sur petit écran. */}
            <div className="flex flex-wrap gap-2">
              {current.rows.map((row) => (
                <span
                  key={row.label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800"
                >
                  {row.label} → Tunisie
                  <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {row.count}
                  </span>
                </span>
              ))}
            </div>

            <Link href={listingPathByTab[tab]}>
              <Button variant="secondary" size="sm">
                {listingLabelByTab[tab]}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
