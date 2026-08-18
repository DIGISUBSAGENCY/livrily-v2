import { z } from 'zod'
import { COUNTRY_CODES } from '@/lib/constants/countries'

// Édition admin d'un profil client. Volontairement distinct de profileSchema
// (lib/validations/auth.ts, utilisé par /profil/completer) : pas de
// address_lat/address_lng ici — l'admin corrige une adresse en texte libre,
// pas de nouvelle géolocalisation Google Places à chaque édition. Ajoute
// aussi `email`, que le client ne peut pas éditer lui-même.
export const adminUserEditSchema = z.object({
  full_name: z.string().trim().min(2, 'Le nom complet est requis.'),
  email: z.string().trim().toLowerCase().email('Adresse email invalide.'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+216)?\d{8}$/, 'Numéro tunisien invalide (8 chiffres, ex: 20123456).'),
  address: z.string().trim().min(5, 'Adresse requise.'),
  country: z.enum(COUNTRY_CODES, { message: 'Sélectionne un pays.' }),
  profession: z
    .string()
    .trim()
    .max(100, 'Profession trop longue (100 caractères max).')
    .optional()
    .transform((v) => (v ? v : null)),
})

// Création d'un compte par l'admin (/admin/utilisateurs/nouveau) — mêmes
// règles que adminUserEditSchema (téléphone tunisien, pays, profession
// optionnelle), plus un mot de passe initial. Même contrainte de longueur
// que signUpSchema (lib/validations/auth.ts) pour rester cohérent avec le
// flow d'inscription self-service.
export const adminUserCreateSchema = adminUserEditSchema.extend({
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
})

// Ajustement manuel du solde. amount signé (positif = crédit, négatif =
// débit) plutôt que deux champs "montant" + "sens" — plus simple à saisir
// et à transmettre tel quel à adjust_wallet_balance() (schema.sql).
export const walletAdjustmentSchema = z.object({
  amount: z.coerce
    .number({ message: 'Montant invalide.' })
    .refine((v) => v !== 0, 'Le montant ne peut pas être nul.')
    .refine((v) => Math.abs(v) <= 100000, 'Montant trop élevé.'),
  reason: z.string().trim().min(5, 'Une raison détaillée est requise (5 caractères minimum).').max(300, 'Raison trop longue (300 caractères max).'),
})
