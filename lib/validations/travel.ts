import { z } from 'zod'

export const travelRequestSchema = z.object({
  item_description: z.string().trim().min(5, "Décris l'objet (au moins 5 caractères)."),
  item_url: z
    .string()
    .trim()
    .url('URL invalide.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  origin_country: z.string().trim().min(2, "Pays d'origine requis."),
  destination_city: z.string().trim().min(2, 'Ville de destination requise.'),
  budget_max: z.coerce.number().min(0, 'Le budget doit être positif.'),
  needed_by: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export const travelProposalSchema = z.object({
  item_price: z.coerce.number().min(0, "Le prix de l'objet doit être positif."),
  delivery_fee: z.coerce.number().min(0, 'Les frais de service doivent être positifs.'),
  travel_date: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  message: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

// Contre-offre dans une négociation existante — mêmes bornes que la
// proposition initiale, sans travel_date (pas renégociée à chaque tour).
export const counterOfferSchema = z.object({
  item_price: z.coerce.number().min(0, "Le prix de l'objet doit être positif."),
  delivery_fee: z.coerce.number().min(0, 'Les frais de service doivent être positifs.'),
  message: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

// Cash exclu volontairement : aucune garde possible sur du liquide non
// perçu par la plateforme (cf. supabase/schema.sql, accept_travel_proposal).
export const acceptProposalVirementSchema = z.object({
  proposalId: z.string().uuid(),
})
