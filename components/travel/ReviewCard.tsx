import { StarRating } from '@/components/ui/StarRating'
import { Card } from '@/components/ui/Card'

interface ReviewCardProps {
  rating: number
  comment: string | null
  reviewerName: string
  createdAt: string
}

// Affiche un avis REÇU (utilisé dans l'onglet Avis de /profil, où on ne
// voit que ses propres avis reçus, déjà filtrés par la policy RLS
// travel_reviews_select_involved — qui gère elle-même le double aveugle,
// donc tout ce qui arrive ici est déjà révélé, rien à vérifier de plus).
export function ReviewCard({ rating, comment, reviewerName, createdAt }: ReviewCardProps) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{reviewerName}</p>
          <p className="text-xs text-slate-400">{new Date(createdAt).toLocaleDateString('fr-TN')}</p>
        </div>
        <StarRating value={rating} size="sm" />
      </div>
      {comment && <p className="mt-2 text-sm text-slate-600">{comment}</p>}
    </Card>
  )
}
