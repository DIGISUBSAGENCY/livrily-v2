import { z } from 'zod'

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choisis une note.').max(5),
  comment: z
    .string()
    .trim()
    .max(500, 'Commentaire trop long (500 caractères max).')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})
