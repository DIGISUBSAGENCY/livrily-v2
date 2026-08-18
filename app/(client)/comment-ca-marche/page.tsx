import type { Metadata } from 'next'
import Link from 'next/link'
import { ShoppingBag, Plane, ShieldCheck, MapPin, Wallet, PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Comment ça marche',
  description: 'Comment fonctionnent les courses et le crowd-shipping Livrily, étape par étape.',
})

const orderSteps = [
  { icon: ShoppingBag, title: 'Commande', description: 'Choisis un commerce et ajoute tes articles au panier.' },
  { icon: MapPin, title: 'Livraison suivie', description: 'Le commerce prépare ta commande, suis-la en direct sur la carte.' },
  { icon: PackageCheck, title: 'Réception', description: 'Paye en espèces, par virement ou par Flouci à la livraison.' },
]

const jibliSteps = [
  { icon: Plane, title: 'Publie ta demande', description: "Décris l'objet, le lien produit et une photo si tu en as une." },
  { icon: ShieldCheck, title: 'Un voyageur propose', description: 'Les voyageurs qui passent par ta destination te font une offre.' },
  { icon: Wallet, title: 'Paiement sécurisé', description: "L'argent reste séquestré et n'est versé au voyageur qu'à la réception confirmée." },
]

export default function CommentCaMarchePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Comment ça marche</h1>
        <p className="mt-3 text-slate-600">Deux façons d&apos;utiliser Livrily, expliquées simplement.</p>
      </div>

      <section className="mt-12">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <ShoppingBag className="h-5 w-5 text-brand-600" aria-hidden />
          Commander chez un commerce
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {orderSteps.map((step, i) => (
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
        <div className="mt-5 text-center">
          <Link href="/commerces">
            <Button size="sm">Voir les commerces</Button>
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
          <Plane className="h-5 w-5 text-brand-600" aria-hidden />
          Jibli chay men l&apos;a5er (crowd-shipping)
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
          d&apos;accepter une offre — elle sert à générer un contrat entre toi, le voyageur et
          Livrily, qui protège les deux parties.
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
