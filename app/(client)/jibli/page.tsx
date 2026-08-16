import type { Metadata } from 'next'
import Link from 'next/link'
import { Plane, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RequestCard } from '@/components/travel/RequestCard'
import { RequestFilters } from '@/components/travel/RequestFilters'
import { Button } from '@/components/ui/Button'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Jibli chay men l’a5er — Crowd-shipping',
  description:
    "Demande à un voyageur de te ramener un objet de l'étranger, ou rentabilise ton prochain voyage en le ramenant toi-même. Paiement sécurisé, en séquestre jusqu'à réception.",
})

interface JibliPageProps {
  searchParams: Promise<{ origin?: string; destination?: string }>
}

export default async function JibliHomePage({ searchParams }: JibliPageProps) {
  const { origin, destination } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('travel_requests')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (origin) query = query.ilike('origin_country', `%${origin}%`)
  if (destination) query = query.ilike('destination_city', `%${destination}%`)

  const { data: requests, error } = await query

  // Propositions du voyageur courant sur les demandes affichées, pour
  // remplacer l'estimation par le gain réel sur sa propre carte (cf. RLS :
  // il ne peut de toute façon pas voir celles des autres voyageurs).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let ownProposalsByRequest = new Map<string, { item_price: number; delivery_fee: number }>()
  if (user && requests && requests.length > 0) {
    const { data: ownProposals } = await supabase
      .from('travel_proposals')
      .select('request_id, item_price, delivery_fee')
      .eq('voyageur_id', user.id)
      .in('request_id', requests.map((r) => r.id))

    ownProposalsByRequest = new Map(
      (ownProposals ?? []).map((p) => [p.request_id, { item_price: p.item_price, delivery_fee: p.delivery_fee }])
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Plane className="h-6 w-6 text-brand-600" aria-hidden />
            Jibli chay men l&apos;a5er
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Demande à un voyageur de te ramener un objet de l&apos;étranger.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jibli/mes-demandes">
            <Button variant="secondary" size="sm">
              Mes demandes
            </Button>
          </Link>
          <Link href="/jibli/mes-propositions">
            <Button variant="secondary" size="sm">
              Mes propositions
            </Button>
          </Link>
          <Link href="/jibli/mes-gains">
            <Button variant="secondary" size="sm">
              Mes gains
            </Button>
          </Link>
          <Link href="/jibli/nouvelle-demande">
            <Button size="sm">Publier une demande</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <RequestFilters defaultOrigin={origin ?? ''} defaultDestination={destination ?? ''} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les demandes.</p>}

      {!error && requests && requests.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Package className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune demande ouverte pour l&apos;instant.</p>
        </div>
      )}

      {!error && requests && requests.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              ownProposal={ownProposalsByRequest.get(request.id) ?? null}
            />
          ))}
        </div>
      )}
    </main>
  )
}
