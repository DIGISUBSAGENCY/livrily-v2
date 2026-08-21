'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  value: number
  size?: 'sm' | 'md' | 'lg'
  // Mode saisie (ReviewForm) vs affichage seul (moyenne, avis individuels).
  // Un seul composant pour les deux plutôt que dupliquer le rendu des 5
  // étoiles — même logique que ResolutionForm partagé entre 2 features.
  onChange?: (value: number) => void
  className?: string
}

const sizeClasses = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' }

// value peut être non-entier (moyenne, ex: 4.3) en mode affichage seul :
// remplissage arrondi à l'étoile la plus proche, pas de remplissage partiel
// (pas de dégradé/SVG clip pour l'instant, simple et suffisant pour une
// moyenne affichée à 1 décimale à côté du chiffre lui-même).
export function StarRating({ value, size = 'md', onChange, className }: StarRatingProps) {
  const interactive = Boolean(onChange)
  const rounded = Math.round(value)

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)} role={interactive ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onChange?.(star)}
          aria-label={interactive ? `${star} étoile${star > 1 ? 's' : ''}` : undefined}
          className={cn(!interactive && 'cursor-default')}
        >
          <Star
            className={cn(
              sizeClasses[size],
              star <= rounded ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200',
              interactive && 'transition-transform hover:scale-110'
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  )
}
