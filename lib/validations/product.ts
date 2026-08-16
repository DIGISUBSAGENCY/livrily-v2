import { z } from 'zod'

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Le nom est requis.'),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  price: z.coerce.number().min(0, 'Le prix doit être positif.'),
  unit: z.string().trim().min(1, "L'unité est requise.").default('pièce'),
  image_url: z
    .string()
    .trim()
    .url('URL invalide.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Calculé côté appelant depuis la case à cocher (`formData.get('is_available') === 'on'`)
  // avant validation — un checkbox non coché n'est pas envoyé dans FormData,
  // donc z.coerce.boolean() traiterait par erreur "false" comme truthy.
  is_available: z.boolean().default(true),
  // Même remarque que is_available : calculé côté appelant depuis la case à cocher.
  requires_prescription: z.boolean().default(false),
})
