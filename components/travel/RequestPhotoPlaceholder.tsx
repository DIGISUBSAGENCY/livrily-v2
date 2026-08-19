import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RequestPhotoPlaceholderProps {
  className?: string
  iconClassName?: string
}

// Fond dégradé de marque plutôt qu'un simple gris neutre : un placeholder
// assumé (pas une image cassée) — la grande majorité des annonces
// actuelles n'ont pas de photo, ce n'est donc pas un cas limite rare mais
// l'état le plus fréquent. Partagé entre RequestCard, TravelRequestCarousel
// et la fiche détail (/jibli/[id]) pour un rendu cohérent partout.
export function RequestPhotoPlaceholder({ className, iconClassName }: RequestPhotoPlaceholderProps) {
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-brand-50 to-brand-100', className)}>
      <Package className={cn('text-brand-400', iconClassName)} aria-hidden />
    </div>
  )
}
