import { z } from 'zod'

export const bankTransferSchema = z.object({
  bank_name: z.string().trim().min(2, 'Le nom de la banque est requis.'),
  account_holder: z.string().trim().min(2, 'Le titulaire du compte est requis.'),
  rib: z.string().trim().min(10, 'RIB invalide.'),
  iban: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  flouci_phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // Calculé côté appelant depuis la case à cocher (formData.get('is_active') === 'on').
  is_active: z.boolean().default(true),
})
