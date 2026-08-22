import { cn } from '@/lib/utils'
import { TRUST_CATEGORY_LABELS, TRUST_CATEGORY_TONE, type TrustCategory } from '@/lib/trust'

interface TrustCategoryBadgeProps {
  category: TrustCategory
  // 'sm' : pill inline à côté d'autres badges (ProposalCard, TripMatchCard,
  // RequestMatchCard). 'md' : pill autonome en en-tête de section
  // (TrustPanel).
  size?: 'sm' | 'md'
  className?: string
}

// Extrait de TrustPanel.tsx/ProposalCard.tsx (3e/4e réutilisation : match
// cards Trips) — même ton (jamais de rouge punitif, cf. lib/trust.ts) et
// mêmes libellés catégorie partout où le Trust Score est affiché.
export function TrustCategoryBadge({ category, size = 'sm', className }: TrustCategoryBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        TRUST_CATEGORY_TONE[category],
        className
      )}
    >
      {TRUST_CATEGORY_LABELS[category]}
    </span>
  )
}
