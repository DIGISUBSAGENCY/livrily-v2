import { z } from 'zod'

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
  address_lat: optionalCoordinate(-90, 90),
  address_lng: optionalCoordinate(-180, 180),
})
