import { Star } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface RatingItem {
  score: number
  comment: string | null
  created_at: string
}

// Derniers avis clients affichés sur la fiche commerce (RLS
// ratings_select_public_for_active_commerce autorise cette lecture pour
// n'importe quel visiteur, pas seulement l'auteur de l'avis).
export function RatingsList({ ratings }: { ratings: RatingItem[] }) {
  if (ratings.length === 0) return null

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Avis clients</h2>
      <div className="space-y-3">
        {ratings.map((rating, index) => (
          <Card key={index}>
            <div className="flex items-center justify-between">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((v) => (
                  <Star
                    key={v}
                    className={`h-3.5 w-3.5 ${v <= rating.score ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-400">
                {new Date(rating.created_at).toLocaleDateString('fr-TN')}
              </span>
            </div>
            {rating.comment && <p className="mt-1.5 text-sm text-slate-600">{rating.comment}</p>}
          </Card>
        ))}
      </div>
    </div>
  )
}
