import type { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

// Next.js génère /sitemap.xml à partir de ce fichier (convention App
// Router). Contenu public et indexable uniquement — pas /admin ni les
// pages transactionnelles, déjà exclues via robots.ts et/ou
// `robots: { index: false }` sur ces pages.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/jibli`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/mentions-legales`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/cgv`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/confidentialite`, changeFrequency: 'yearly', priority: 0.2 },
  ]

  const { data: travelRequests } = await supabase.from('travel_requests').select('id, updated_at').eq('status', 'open')

  const travelRoutes: MetadataRoute.Sitemap = (travelRequests ?? []).map((r) => ({
    url: `${siteUrl}/jibli/${r.id}`,
    lastModified: r.updated_at,
    changeFrequency: 'hourly',
    priority: 0.5,
  }))

  return [...staticRoutes, ...travelRoutes]
}
