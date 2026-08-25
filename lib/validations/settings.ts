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

export const autoReleaseSettingsSchema = z.object({
  auto_release_delay_days: z.coerce
    .number({ message: 'Délai invalide.' })
    .int('Le délai doit être un nombre entier de jours.')
    .min(1, "Le délai doit être d'au moins 1 jour.")
    .max(90, 'Le délai ne peut pas dépasser 90 jours.'),
})

// Prix d'un palier boost_pricing_tiers (duration_days fixe, 1-7, jamais
// édité ici — seul price_tnd change). positive() plutôt que min(0, ...) :
// un palier à 0 TND rendrait la mise en avant gratuite, jamais un cas
// valide contrairement au taux de commission ci-dessus qui peut
// légitimement être à 0%. Pas de max artificiel — aucune borne haute
// naturelle pour un prix (contrairement à un pourcentage), inventer un
// plafond ajouterait une contrainte non demandée.
export const boostTierPriceSchema = z.object({
  price_tnd: z.coerce
    .number({ message: 'Prix invalide.' })
    .positive('Le prix doit être positif.'),
})
