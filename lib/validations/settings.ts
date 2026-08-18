import { z } from 'zod'

// Le formulaire admin saisit un pourcentage humain (ex: 10 pour 10%) ;
// stocké en base comme fraction (0.10) pour correspondre directement au
// calcul `delivery_fee * rate` dans accept_travel_proposal() (schema.sql).
// Arrondi à 4 décimales pour rester dans la précision numeric(5,4) de la
// colonne platform_settings.travel_commission_rate.
export const commissionSettingsSchema = z.object({
  travel_commission_rate: z.coerce
    .number({ message: 'Taux invalide.' })
    .min(0, 'Le taux ne peut pas être négatif.')
    .max(100, 'Le taux ne peut pas dépasser 100%.')
    .transform((percent) => Math.round((percent / 100) * 10000) / 10000),
})
