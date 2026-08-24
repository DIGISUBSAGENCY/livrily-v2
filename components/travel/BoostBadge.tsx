import { Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

// Affiché quand boosted_until est dans le futur (trips/product_offers,
// Phase 3 brique 5/N) — sur les cartes de listing ET les fiches détail.
// isBoosted(boostedUntil) est la seule source de vérité "est boosté en ce
// moment" côté TypeScript, à réutiliser partout plutôt que de reparser la
// date à chaque appelant.
export function isBoosted(boostedUntil: string | null): boolean {
  return boostedUntil !== null && new Date(boostedUntil).getTime() > Date.now()
}

export function BoostBadge() {
  return (
    <Badge tone="warning" className="gap-1">
      <Sparkles className="h-3 w-3" aria-hidden />
      En avant
    </Badge>
  )
}
