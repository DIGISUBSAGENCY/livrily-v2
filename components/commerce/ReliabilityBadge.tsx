import { Clock, ThumbsUp, Star } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface ReliabilityBadgeProps {
  avgDeliveryTimeMinutes: number | null
  onTimeRate: number | null
  ratingsAvg?: number | null
  ratingsCount?: number
  className?: string
}

// Affiché sur la liste des commerces et la fiche commerce, avant même de
// commander — n'affiche rien tant que le commerce n'a ni commande livrée ni
// avis client (pas de "0%"/"0 avis" trompeur pour un commerce tout juste créé).
export function ReliabilityBadge({
  avgDeliveryTimeMinutes,
  onTimeRate,
  ratingsAvg,
  ratingsCount,
  className,
}: ReliabilityBadgeProps) {
  if (avgDeliveryTimeMinutes == null && ratingsAvg == null) return null

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {avgDeliveryTimeMinutes != null && (
        <Badge tone="neutral" className="flex w-fit items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          ≈ {avgDeliveryTimeMinutes} min
          {onTimeRate != null && (
            <>
              <span className="text-slate-300">·</span>
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
              {onTimeRate}% à l&apos;heure
            </>
          )}
        </Badge>
      )}
      {ratingsAvg != null && (
        <Badge tone="neutral" className="flex w-fit items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
          {ratingsAvg} {ratingsCount ? `(${ratingsCount})` : ''}
        </Badge>
      )}
    </div>
  )
}
