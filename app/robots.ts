import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Next.js génère /robots.txt à partir de ce fichier (convention App Router).
//
// "/commerce$" + "/commerce/" plutôt qu'un simple "/commerce" : Disallow
// matche par PRÉFIXE, et "/commerce" est un préfixe de "/commerces" (la
// liste publique des commerces, qu'on veut au contraire indexer) — un
// "Disallow: /commerce" tout court aurait aussi bloqué /commerces et
// /commerces/[id] par erreur.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/commerce$', '/commerce/', '/api/', '/auth/callback'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
