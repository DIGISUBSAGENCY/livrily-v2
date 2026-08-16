import type { Metadata } from 'next'

interface PageMetadataOptions {
  title: string
  description: string
  // Pages transactionnelles/privées (checkout, commandes, profil...) : pas
  // de valeur à être indexées, mais restent crawlable (follow) — outil
  // correct pour ça, différent de robots.ts qui bloque la découverte des
  // sections entières /admin et /commerce.
  noIndex?: boolean
}

// Next.js NE déduit PAS openGraph/twitter à partir de title/description
// quand une page définit ses propres métadonnées : sans ce helper, partager
// une page précise (fiche commerce, demande de voyage...) sur WhatsApp
// afficherait le titre générique du site plutôt que le titre de la page.
// Le titre "nu" passé à `title` profite lui du gabarit du layout racine
// ("%s | Livrily") ; openGraph/twitter ne sont pas gabarités, donc on
// construit le titre complet nous-mêmes pour rester cohérent entre l'onglet
// du navigateur et la carte de partage.
export function pageMetadata({ title, description, noIndex }: PageMetadataOptions): Metadata {
  const fullTitle = `${title} | Livrily`

  return {
    title,
    description,
    openGraph: { title: fullTitle, description },
    twitter: { title: fullTitle, description },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  }
}
