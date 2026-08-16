import type { Metadata } from 'next'
import Link from 'next/link'
import { RequestForm } from '@/components/travel/RequestForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Publier une demande',
  description: 'Décris ce que tu veux qu’on te ramène de l’étranger sur Livrily.',
  noIndex: true,
})

export default function NewTravelRequestPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/jibli" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Jibli chay men l&apos;a5er
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Publier une demande</h1>
      <p className="mt-1 text-sm text-slate-500">
        Décris ce que tu veux qu&apos;on te ramène de l&apos;étranger. N&apos;importe quel
        voyageur pourra te proposer de le ramener.
      </p>
      <Card className="mt-6">
        <RequestForm />
      </Card>
    </main>
  )
}
