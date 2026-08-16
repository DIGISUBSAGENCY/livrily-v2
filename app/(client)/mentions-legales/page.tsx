import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mentions légales',
  description: 'Mentions légales de Livrily : raison sociale, hébergement, directeur de la publication.',
})

export default function MentionsLegalesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50">
          <FileText className="h-5 w-5 text-brand-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mentions légales</h1>
      </div>
      <Card className="mt-6">
        <Badge tone="neutral">À venir</Badge>
        <p className="mt-3 text-sm text-slate-500">
          Cette page sera complétée prochainement (raison sociale, forme juridique, numéro
          d&apos;immatriculation, siège social, directeur de la publication, hébergeur...).
        </p>
      </Card>
    </main>
  )
}
