import type { Metadata } from 'next'
import Link from 'next/link'
import { Plane, ShieldCheck, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Comment ça marche',
  description: 'Comment fonctionne le crowd-shipping Livrily, étape par étape.',
})

const jibliSteps = [
  { icon: Plane, title: 'Publie ta demande', description: "Décris l'objet, le lien produit et une photo si tu en as une." },
  { icon: ShieldCheck, title: 'Un voyageur propose', description: 'Les voyageurs qui passent par ta destination te font une offre.' },
  { icon: Wallet, title: 'Paiement sécurisé', description: "L'argent reste séquestré et n'est versé au voyageur qu'à la réception confirmée." },
]

export default function CommentCaMarchePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <Heading level="h1">Comment ça marche</Heading>
        <p className="mt-3 text-slate-600">Jibli chay men l&apos;a5er — le crowd-shipping Livrily, expliqué simplement.</p>
      </div>

      <section className="mt-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {jibliSteps.map((step, i) => (
            <Card key={step.title} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                <step.icon className="h-6 w-6 text-brand-600" aria-hidden />
              </div>
              <p className="mt-3 text-xs font-semibold text-brand-600">Étape {i + 1}</p>
              <p className="mt-1 font-semibold text-slate-900">{step.title}</p>
              <p className="mt-1 text-sm text-slate-500">{step.description}</p>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          Une vérification d&apos;identité (~2 min) est requise avant de publier une demande ou
          d&apos;accepter une offre — la livraison se fait directement entre client et voyageur,
          sans intermédiaire, et vérifier l&apos;identité des deux parties protège tout le monde
          avant qu&apos;un paiement réel soit engagé.
        </p>
        <div className="mt-5 text-center">
          <Link href="/jibli">
            <Button size="sm">Voir les demandes ouvertes</Button>
          </Link>
        </div>
      </section>
    </main>
  )
}
