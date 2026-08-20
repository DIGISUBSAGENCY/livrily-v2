'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PackageSearch, Luggage, Star, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type TabKey = 'apercu' | 'demandes' | 'propositions' | 'avis' | 'a-propos'

interface ProfileTabsProps {
  overview: React.ReactNode
}

const tabs: { key: TabKey; label: string }[] = [
  { key: 'apercu', label: 'Aperçu' },
  { key: 'demandes', label: 'Demandes' },
  { key: 'propositions', label: 'Mes propositions' },
  { key: 'avis', label: 'Avis' },
  { key: 'a-propos', label: 'À propos' },
]

// "Voyages" écarté (pas d'équivalent dans le modèle Livrily — un voyageur
// ne publie pas de voyage à part, il propose directement sur une demande
// existante, cf. Mes propositions). Demandes/Mes propositions ont déjà des
// pages dédiées (mes-demandes, mes-propositions) : plutôt que dupliquer
// leur contenu ici, ce tab affiche une carte de redirection. Avis/À propos
// n'ont encore aucune donnée réelle derrière (pas de notation entre
// particuliers dans le schéma actuel) : placeholder "Bientôt disponible".
export function ProfileTabs({ overview }: ProfileTabsProps) {
  const [tab, setTab] = useState<TabKey>('apercu')

  return (
    <div className="mt-6">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
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

      <div className="mt-4">
        {tab === 'apercu' && overview}

        {tab === 'demandes' && (
          <RedirectPanel
            icon={PackageSearch}
            title="Tes demandes de crowd-shipping"
            description="Retrouve toutes les demandes que tu as publiées, en cours ou déjà livrées."
            href="/jibli/mes-demandes"
            label="Voir mes demandes"
          />
        )}

        {tab === 'propositions' && (
          <RedirectPanel
            icon={Luggage}
            title="Tes propositions en tant que voyageur"
            description="Retrouve les propositions que tu as faites sur des demandes publiées par d'autres."
            href="/jibli/mes-propositions"
            label="Voir mes propositions"
          />
        )}

        {tab === 'avis' && (
          <EmptyPanel icon={Star} title="Avis" description="Les avis entre utilisateurs arrivent bientôt." />
        )}

        {tab === 'a-propos' && (
          <EmptyPanel icon={Info} title="À propos" description="Cette section sera bientôt disponible." />
        )}
      </div>
    </div>
  )
}

function RedirectPanel({
  icon: Icon,
  title,
  description,
  href,
  label,
}: {
  icon: typeof PackageSearch
  title: string
  description: string
  href: string
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
        <Icon className="h-6 w-6 text-brand-600" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <Link href={href}>
        <Button size="sm">{label}</Button>
      </Link>
    </div>
  )
}

function EmptyPanel({ icon: Icon, title, description }: { icon: typeof Star; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" aria-hidden />
      </div>
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">Bientôt disponible — {description}</p>
      </div>
    </div>
  )
}
