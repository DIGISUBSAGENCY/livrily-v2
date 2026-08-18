// Pays proposés à la complétion de profil : Tunisie en premier (public
// cible principal, valeur par défaut du select), puis le reste du Maghreb,
// puis les principaux pays européens/francophones. "Autre" en dernier
// recours pour ne jamais bloquer un utilisateur dont le pays n'y figure pas.
// Liste centralisée ici (plutôt que dupliquée entre le formulaire et la
// validation Zod) pour que les deux restent toujours synchronisées.
export const COUNTRIES = [
  { value: 'TN', label: 'Tunisie' },
  { value: 'DZ', label: 'Algérie' },
  { value: 'MA', label: 'Maroc' },
  { value: 'LY', label: 'Libye' },
  { value: 'MR', label: 'Mauritanie' },
  { value: 'FR', label: 'France' },
  { value: 'BE', label: 'Belgique' },
  { value: 'CH', label: 'Suisse' },
  { value: 'CA', label: 'Canada' },
  { value: 'DE', label: 'Allemagne' },
  { value: 'IT', label: 'Italie' },
  { value: 'ES', label: 'Espagne' },
  { value: 'OTHER', label: 'Autre' },
] as const

export type CountryCode = (typeof COUNTRIES)[number]['value']

export const COUNTRY_CODES = COUNTRIES.map((c) => c.value) as [CountryCode, ...CountryCode[]]
