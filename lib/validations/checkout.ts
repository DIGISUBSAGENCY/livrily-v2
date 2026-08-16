import { z } from 'zod'

// On ne fait jamais confiance au prix/nom envoyés par le client : seuls
// productId + quantity sont acceptés, le reste est rechargé depuis la DB
// dans la Server Action placeOrder.
export const checkoutCartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(50),
})

export const checkoutSchema = z.object({
  commerceId: z.string().uuid(),
  cart: z.array(checkoutCartItemSchema).min(1, 'Le panier est vide.'),
  deliveryAddress: z.string().trim().min(5, 'Adresse de livraison requise.'),
  deliveryLat: z.coerce.number().min(-90).max(90),
  deliveryLng: z.coerce.number().min(-180).max(180),
  paymentMethod: z.enum(['cash', 'flouci', 'virement']),
  clientNote: z
    .string()
    .trim()
    .max(300, 'La note est limitée à 300 caractères.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Calculé côté appelant depuis la case à cocher (même convention que
  // is_available côté produits) — un checkbox non coché n'est pas envoyé
  // dans FormData.
  useWalletCredit: z.boolean().default(false),
})
