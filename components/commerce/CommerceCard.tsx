import Link from 'next/link'
import { Store } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ReliabilityBadge } from '@/components/commerce/ReliabilityBadge'
import { cn } from '@/lib/utils'
import type { Commerce } from '@/types/database'

const categoryLabels: Record<Commerce['category'], string> = {
  supermarche: 'Supermarché',
  boulangerie: 'Boulangerie',
  fruits_legumes: 'Fruits & légumes',
  pharmacie: 'Pharmacie',
}

export function CommerceCard({ commerce }: { commerce: Commerce }) {
  return (
    <Link href={`/commerces/${commerce.id}`} className="group block h-full">
      <Card
        interactive
        className={cn('flex h-full items-start gap-4', !commerce.is_open && 'opacity-70')}
      >
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
          {commerce.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logos externes, pas d'optimisation next/image nécessaire pour l'instant
            <img
              src={commerce.logo_url}
              alt={commerce.name}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
            />
          ) : (
            <Store className="h-6 w-6 text-slate-400" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 transition-colors group-hover:text-brand-700">
            {commerce.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="info">{categoryLabels[commerce.category]}</Badge>
            {!commerce.is_open && <Badge tone="neutral">Fermé</Badge>}
          </div>
          {commerce.address && <p className="mt-2 truncate text-sm text-slate-500">{commerce.address}</p>}
          <ReliabilityBadge
            avgDeliveryTimeMinutes={commerce.avg_delivery_time_minutes}
            onTimeRate={commerce.on_time_rate}
            ratingsAvg={commerce.ratings_avg}
            ratingsCount={commerce.ratings_count}
            className="mt-2"
          />
        </div>
      </Card>
    </Link>
  )
}
