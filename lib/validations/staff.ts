import { z } from 'zod'

export const staffSchema = z.object({
  full_name: z.string().trim().min(2, 'Le nom est requis.'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+216)?\d{8}$/, 'Numéro tunisien invalide (8 chiffres, ex: 20123456).')
    .optional()
    .or(z.literal('').transform(() => undefined)),
})
