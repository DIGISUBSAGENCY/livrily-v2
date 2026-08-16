import { z } from 'zod'

export const zoneSchema = z.object({
  name: z.string().trim().min(2, 'Le nom de la zone est requis.'),
  city: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  center_lat: z.coerce.number().min(-90).max(90),
  center_lng: z.coerce.number().min(-180).max(180),
  radius_meters: z.coerce.number().int().positive('Le rayon doit être positif.'),
  delivery_fee: z.coerce.number().min(0, 'Les frais de base doivent être positifs.'),
  fee_per_km: z.coerce.number().min(0, 'Les frais au km doivent être positifs.'),
  min_order_amount: z.coerce.number().min(0, 'Le minimum de commande doit être positif.'),
  // Calculé côté appelant depuis la case à cocher (formData.get('is_active') === 'on').
  is_active: z.boolean().default(true),
})

export const surgeRuleSchema = z
  .object({
    label: z.string().trim().min(2, 'Le nom de la règle est requis.'),
    days_of_week: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, 'Sélectionne au moins un jour.'),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure de début invalide.'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure de fin invalide.'),
    multiplier: z.coerce.number().positive('Le multiplicateur doit être positif.'),
    is_active: z.boolean().default(true),
  })
  .refine((data) => data.start_time < data.end_time, {
    message: "L'heure de fin doit être après l'heure de début (pas de créneau traversant minuit).",
    path: ['end_time'],
  })
