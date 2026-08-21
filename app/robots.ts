import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

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
