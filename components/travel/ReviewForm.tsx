'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitReview } from '@/app/(client)/jibli/[id]/actions'
import { StarRating } from '@/components/ui/StarRating'
import { Label } from '@/components/ui/Label'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

interface ReviewFormProps {
  requestId: string
  // Nom de l'autre partie (client ou voyageur selon qui remplit) — pour un
  // libellé clair, même si le serveur recalcule reviewee_id/direction
  // indépendamment (cf. submitReview).
  otherPartyName: string
}

// Commentaire optionnel : seule la note est obligatoire, cohérent avec
// reviewSchema (lib/validations/reviews.ts).
export function ReviewForm({ requestId, otherPartyName }: ReviewFormProps) {
  const router = useRouter()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) {
      setError("Choisis une note avant d'envoyer.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitReview(requestId, rating, comment)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label>Ta note pour {otherPartyName}</Label>
        <StarRating value={rating} onChange={setRating} size="lg" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="review_comment">Commentaire (optionnel)</Label>
        <textarea
          id="review_comment"
          rows={3}
          placeholder="Comment s'est passée cette mission ?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? 'Envoi…' : "Envoyer l'avis"}
      </Button>
    </form>
  )
}
