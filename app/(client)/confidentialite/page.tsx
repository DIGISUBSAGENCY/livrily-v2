import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Politique de confidentialité',
  description: 'Comment Livrily collecte, utilise et protège tes données personnelles.',
})

export default function ConfidentialitePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50">
          <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
        </div>
        <Heading level="h1">Politique de confidentialité</Heading>
      </div>
      <Card className="mt-6">
        <Badge tone="neutral">À venir</Badge>
        <p className="mt-3 text-sm text-slate-500">
          Cette page sera complétée prochainement (données collectées, finalités, durée de
          conservation, droits d&apos;accès et de suppression, cookies...).
        </p>
      </Card>
    </main>
  )
}
