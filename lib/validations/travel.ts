import { z } from 'zod'

// Ajoute https:// devant une URL saisie sans protocole (ex: "google.com")
// avant de la valider, plutôt que de rejeter — z.string().url() exige un
// protocole explicite et ce n'est pas ce qu'un utilisateur tape
// naturellement en collant un lien depuis la barre d'adresse d'un site.
function normalizeUrlInput(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export const travelRequestSchema = z.object({
  item_description: z.string().trim().min(5, "Décris l'objet (au moins 5 caractères)."),
  item_url: z.preprocess(normalizeUrlInput, z.string().url('URL invalide.').optional()),
  origin_country: z.string().trim().min(2, "Pays d'origine requis."),
  destination_city: z.string().trim().min(2, 'Ville de destination requise.'),
  budget_max: z.coerce.number().min(0, 'Le budget doit être positif.'),
  needed_by: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

// Durées de validité proposées côté formulaire (dropdown) — converties en
// expires_at (timestamp absolu) côté serveur. Purement informatif pour
// l'instant : rien ne retire automatiquement la proposition à l'échéance.
export const proposalValiditySchema = z.enum(['24h', '48h', '7d'])
export type ProposalValidity = z.infer<typeof proposalValiditySchema>

export const travelProposalSchema = z.object({
  item_price: z.coerce.number().min(0, "Le prix de l'objet doit être positif."),
  delivery_fee: z.coerce.number().min(0, 'Les frais de service doivent être positifs.'),
  travel_date: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  pickup_city: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  validity: proposalValiditySchema.optional().or(z.literal('').transform(() => undefined)),
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
