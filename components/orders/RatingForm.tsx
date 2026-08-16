'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Star } from 'lucide-react'
import { submitRating } from '@/app/(client)/commandes/[id]/actions'
import type { ActionResult } from '@/app/(client)/commandes/[id]/actions'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const initialState: ActionResult = { error: null }

// Affiché sur /commandes/[id] uniquement quand status='delivered' et
// qu'aucune note n'existe encore pour cette commande (une seule autorisée,
// order_id est unique sur ratings).
export function RatingForm({ orderId }: { orderId: string }) {
  const action = submitRating.bind(null, orderId)
  const [state, formAction] = useFormState(action, initialState)
  const [score, setScore] = useState(0)
  const [hovered, setHovered] = useState(0)

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Comment s&apos;est passée ta commande ?</h2>
      <form action={formAction} className="mt-3 space-y-3">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setScore(value)}
              onMouseEnter={() => setHovered(value)}
              onMouseLeave={() => setHovered(0)}
              aria-label={`${value} étoile${value > 1 ? 's' : ''}`}
              className="p-0.5"
            >
              <Star
                className={cn(
                  'h-7 w-7',
                  (hovered || score) >= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                )}
              />
            </button>
          ))}
        </div>
        <input type="hidden" name="score" value={score} />

        <textarea
          name="comment"
          maxLength={500}
          rows={3}
          placeholder="Un commentaire (optionnel)…"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {state.error && <ErrorText>{state.error}</ErrorText>}

        <SubmitButton disabled={score === 0} pendingLabel="Envoi…">
          Envoyer mon avis
        </SubmitButton>
      </form>
    </Card>
  )
}
