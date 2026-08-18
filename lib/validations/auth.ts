import { z } from 'zod'
import { COUNTRY_CODES } from '@/lib/constants/countries'

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide.'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
})

export const signUpSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Adresse email invalide.'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  })

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse email invalide.'),
})

// Vérification par CODE (OTP) plutôt que par lien cliquable — un lien
// envoyé par email est systématiquement récupéré et pré-consommé par le
// click-tracking automatique de la chaîne d'envoi (Resend → AWS SES,
// domaine awstrack.me), rendant le token à usage unique déjà expiré au
// moment du vrai clic humain. Un code en texte brut dans l'email n'a rien
// qu'un service de tracking puisse pré-charger : immunisé structurellement,
// pas juste "moins probable de poser problème". email répété ici (requis
// par supabase.auth.verifyOtp({ email, token, type: 'recovery' })).
//
// 8 chiffres, pas 6 : la longueur du OTP email GoTrue est configurable côté
// Supabase (GOTRUE_MAILER_OTP_LENGTH, Dashboard → Authentication → Email)
// et dépend de quand/comment le projet a été provisionné — ce projet-ci en
// génère 8, vérifié empiriquement sur un email reçu (pas une valeur par
// défaut supposée à tort à 6, l'erreur initiale ici).
export const resetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Adresse email invalide.'),
    token: z
      .string()
      .trim()
      .regex(/^\d{8}$/, 'Le code doit contenir exactement 8 chiffres.'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  })

// Coordonnée optionnelle : le champ hidden envoie '' quand l'adresse a été
// saisie manuellement (fallback sans clé Google Maps, cf. AddressAutocomplete).
// On ne bloque jamais la complétion de profil pour une histoire de clé API
// non configurée — seule l'adresse texte est requise.
function optionalCoordinate(min: number, max: number) {
  return z
    .union([z.literal(''), z.coerce.number()])
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === null || v === undefined ? null : v))
    .refine((v) => v === null || (v >= min && v <= max), 'Coordonnée invalide.')
}

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Le nom complet est requis.'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+216)?\d{8}$/, 'Numéro tunisien invalide (8 chiffres, ex: 20123456).'),
  address: z.string().trim().min(5, 'Adresse requise.'),
  country: z.enum(COUNTRY_CODES, { message: 'Sélectionne un pays.' }),
  // Libre et optionnel : transformé en null (plutôt que chaîne vide) pour
  // rester cohérent avec le reste du schéma DB (colonne nullable).
  profession: z
    .string()
    .trim()
    .max(100, 'Profession trop longue (100 caractères max).')
    .optional()
    .transform((v) => (v ? v : null)),
  address_lat: optionalCoordinate(-90, 90),
  address_lng: optionalCoordinate(-180, 180),
})
