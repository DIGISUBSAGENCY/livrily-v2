import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

// Next.js génère /robots.txt à partir de ce fichier (convention App Router).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/auth/callback'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
