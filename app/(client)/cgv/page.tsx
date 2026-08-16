import type { Metadata } from 'next'
import { ScrollText } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Conditions générales de vente',
  description: 'Conditions générales de vente Livrily : commandes, livraison, paiement et crowd-shipping.',
})

export default function CgvPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-50">
          <ScrollText className="h-5 w-5 text-brand-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Conditions générales de vente</h1>
      </div>
      <Card className="mt-6">
        <Badge tone="neutral">À venir</Badge>
        <p className="mt-3 text-sm text-slate-500">
          Cette page sera complétée prochainement (modalités de commande, livraison, paiement,
          rétractation, garanties, gestion des litiges pour les commandes et le crowd-shipping...).
        </p>
      </Card>
    </main>
  )
}
