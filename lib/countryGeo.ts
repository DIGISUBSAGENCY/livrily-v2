// Correspondance pays → coordonnées pour la carte "Activité en direct" du
// dashboard (/jibli/dashboard). Nécessaire car trips.origin_country/
// product_offers.origin_country/travel_requests.origin_country sont des
// champs TEXTE LIBRE (<Input placeholder="France">, pas un select
// contrôlé — vérifié en explorant TripForm.tsx/ProductOfferForm.tsx avant
// de coder cette table) : rien ne garantit qu'une valeur corresponde
// proprement à un pays reconnu (casse incohérente en prod : "France"/
// "france" ; parfois une ville saisie par erreur, ex: "lyon"). Best-effort
// assumé — toute valeur non reconnue tombe dans un repli "Autres" côté
// appelant (aggregateByCountry ci-dessous), jamais silencieusement perdue.
//
// Couvre lib/constants/countries.ts (select de profil) + les valeurs
// réellement vues en base à ce jour (ex: Émirats arabes unis) + quelques
// pays plausibles pour ce type de plateforme. Coordonnées approximatives
// (centroïde/capitale), suffisant pour une carte de répartition, pas une
// géolocalisation précise.
export interface CountryGeoEntry {
  code: string
  label: string
  lat: number
  lng: number
}

const ENTRIES: CountryGeoEntry[] = [
  { code: 'TN', label: 'Tunisie', lat: 34.0, lng: 9.6 },
  { code: 'DZ', label: 'Algérie', lat: 28.0, lng: 3.0 },
  { code: 'MA', label: 'Maroc', lat: 31.8, lng: -7.1 },
  { code: 'LY', label: 'Libye', lat: 26.3, lng: 17.2 },
  { code: 'MR', label: 'Mauritanie', lat: 20.2, lng: -10.9 },
  { code: 'FR', label: 'France', lat: 46.6, lng: 2.2 },
  { code: 'BE', label: 'Belgique', lat: 50.6, lng: 4.5 },
  { code: 'CH', label: 'Suisse', lat: 46.8, lng: 8.2 },
  { code: 'CA', label: 'Canada', lat: 56.1, lng: -106.3 },
  { code: 'DE', label: 'Allemagne', lat: 51.2, lng: 10.4 },
  { code: 'IT', label: 'Italie', lat: 42.5, lng: 12.5 },
  { code: 'ES', label: 'Espagne', lat: 40.0, lng: -4.0 },
  { code: 'AE', label: 'Émirats arabes unis', lat: 23.4, lng: 53.8 },
  { code: 'QA', label: 'Qatar', lat: 25.3, lng: 51.2 },
  { code: 'SA', label: 'Arabie saoudite', lat: 23.9, lng: 45.1 },
  { code: 'GB', label: 'Royaume-Uni', lat: 55.4, lng: -3.4 },
  { code: 'NL', label: 'Pays-Bas', lat: 52.1, lng: 5.3 },
  { code: 'US', label: 'États-Unis', lat: 39.8, lng: -98.6 },
  { code: 'TR', label: 'Turquie', lat: 38.9, lng: 35.2 },
]

// Alias (texte libre → code) — plusieurs formulations possibles par pays,
// FR/EN, avec/sans accents (comparés après normalisation, cf.
// normalizeKey ci-dessous, donc pas besoin de lister les variantes
// d'accentuation ici).
const ALIASES: Record<string, string> = {
  tunisie: 'TN', tunisia: 'TN',
  algerie: 'DZ', algeria: 'DZ',
  maroc: 'MA', morocco: 'MA',
  libye: 'LY', libya: 'LY',
  mauritanie: 'MR', mauritania: 'MR',
  france: 'FR', fr: 'FR',
  belgique: 'BE', belgium: 'BE',
  suisse: 'CH', switzerland: 'CH',
  canada: 'CA',
  allemagne: 'DE', germany: 'DE',
  italie: 'IT', italy: 'IT',
  espagne: 'ES', spain: 'ES',
  'emirats arabes unis': 'AE', 'united arab emirates': 'AE', uae: 'AE', emirats: 'AE',
  qatar: 'QA',
  'arabie saoudite': 'SA', 'saudi arabia': 'SA',
  'royaume-uni': 'GB', 'royaume uni': 'GB', 'united kingdom': 'GB', uk: 'GB', angleterre: 'GB',
  'pays-bas': 'NL', 'pays bas': 'NL', netherlands: 'NL', hollande: 'NL',
  'etats-unis': 'US', 'etats unis': 'US', usa: 'US', 'united states': 'US',
  turquie: 'TR', turkey: 'TR',

  // Villes (pas des pays) rattachées à leur pays — origin_country étant du
  // texte libre, un voyageur y tape parfois sa ville plutôt que son pays
  // ("lyon" au lieu de "France", vu en prod) : sans ça, "lyon" et "France"
  // ressortaient comme deux pills séparées au lieu de se regrouper. Liste
  // de départ (grandes villes françaises, les plus probables vu le public
  // de la plateforme) — à étendre au fil de l'usage réel (autres pays,
  // autres villes) plutôt que de viser l'exhaustivité dès maintenant.
  paris: 'FR', lyon: 'FR', marseille: 'FR', toulouse: 'FR', nice: 'FR',
  nantes: 'FR', strasbourg: 'FR', montpellier: 'FR', bordeaux: 'FR', lille: 'FR',
  rennes: 'FR', toulon: 'FR', grenoble: 'FR', dijon: 'FR', angers: 'FR',
}

const ENTRY_BY_CODE = new Map(ENTRIES.map((e) => [e.code, e]))

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents après décomposition
}

export function lookupCountryGeo(raw: string): CountryGeoEntry | null {
  const code = ALIASES[normalizeKey(raw)]
  return code ? (ENTRY_BY_CODE.get(code) ?? null) : null
}

export interface CountryFlowRow {
  label: string
  count: number
  lat: number | null
  lng: number | null
}

// Regroupe une liste brute de origin_country (texte libre) par pays
// reconnu ; toute valeur non reconnue garde son texte original tel quel
// (lat/lng null) plutôt que d'être fusionnée dans un blob "Autres" opaque —
// chaque valeur affichée reste traçable jusqu'à ce qui a été saisi.
// Agrégation faite ici en JS (pas un GROUP BY SQL) : volume actuel trop
// faible (quelques lignes) pour justifier une RPC dédiée, cf. plan validé.
export function aggregateByCountry(rawCountries: string[]): CountryFlowRow[] {
  const map = new Map<string, CountryFlowRow>()
  for (const raw of rawCountries) {
    const geo = lookupCountryGeo(raw)
    const key = geo ? geo.code : `unmatched:${normalizeKey(raw)}`
    const existing = map.get(key)
    if (existing) {
      existing.count += 1
    } else {
      map.set(key, { label: geo?.label ?? raw.trim(), count: 1, lat: geo?.lat ?? null, lng: geo?.lng ?? null })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}
