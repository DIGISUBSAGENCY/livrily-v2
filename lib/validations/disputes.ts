import { z } from 'zod'

export const disputeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Décris le problème (au moins 10 caractères).')
    .max(1000, 'Description trop longue (1000 caractères max).'),
})
