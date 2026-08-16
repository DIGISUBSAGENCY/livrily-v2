import { z } from 'zod'

export const commerceSchema = z.object({
  name: z.string().trim().min(2, 'Le nom du commerce est requis.'),
  category: z.enum(['supermarche', 'boulangerie', 'fruits_legumes']),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  address: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  lat: z.coerce.number().min(-90).max(90).optional().or(z.literal('').transform(() => undefined)),
  lng: z.coerce.number().min(-180).max(180).optional().or(z.literal('').transform(() => undefined)),
  zone_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Calculé côté appelant depuis la case à cocher (formData.get('is_active') === 'on').
  is_active: z.boolean().default(true),
})
