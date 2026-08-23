import type { Metadata } from 'next'
import Link from 'next/link'
import { Plane, Luggage } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TripCard } from '@/components/travel/TripCard'
import { TripFilters, type TripSort } from '@/components/travel/TripFilters'
import { Button } from '@/components/ui/Button'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Trips',
  description: 'Découvre les voyageurs qui annoncent une disponibilité à l’avance sur Livrily.',
})

interface TripsPageProps {
  searchParams: Promise<{ origin?: string; destination?: string; before?: string; sort?: string }>
}

// Miroir simplifié de /jibli (pas de bloc dashboard/stats — le volume ne
// justifie pas encore cette complexité pour les trips, ajoutable plus
// tard sur le même modèle si besoin).
export default async function TripsPage({ searchParams }: TripsPageProps) {
  const { origin, destination, before, sort: sortParam } = await searchParams
  const sort: TripSort = sortParam === 'date_asc' ? sortParam : 'recent'
  const supabase = await createClient()

  // 'open' + 'matched' : un trip pris reste visible avec son statut à jour
  // (badge "Mis en relation" sur TripCard) plutôt que de disparaître —
  // 'completed'/'cancelled' restent filtrés, bruit pas utile à la
  // découverte au quotidien (RLS elle-même n'impose plus cette limite,
  // cf. schema.sql : choix de cette page, pas une contrainte de sécurité).
  let query = supabase.from('trips').select('*').in('status', ['open', 'matched'])

  if (origin) query = query.ilike('origin_country', `%${origin}%`)
  if (destination) query = query.ilike('destination_city', `%${destination}%`)
  if (before) query = query.lte('travel_date', before)

  if (sort === 'date_asc') query = query.order('travel_date', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  const { data: trips, error } = await query

  const hasActiveFilters = Boolean(origin || destination || before)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Plane className="h-6 w-6 text-brand-600" aria-hidden />
            Trips
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Des voyageurs annoncent leur prochaine disponibilité à l&apos;avance.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/jibli">
            <Button variant="secondary" size="sm">
              <Luggage className="h-4 w-4" aria-hidden />
              Voir les demandes
            </Button>
          </Link>
          <Link href="/jibli/trips/nouveau">
            <Button size="sm">Publier un trip</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <TripFilters
          defaultOrigin={origin ?? ''}
          defaultDestination={destination ?? ''}
          defaultBefore={before ?? ''}
          defaultSort={sort}
        />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les trips.</p>}

      {!error && trips && (
        <p className="mt-6 text-sm text-slate-500">
          {trips.length} trip{trips.length !== 1 ? 's' : ''} trouvé{trips.length !== 1 ? 's' : ''}
        </p>
      )}

      {!error && trips && trips.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center text-slate-500">
          <Plane className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          {hasActiveFilters ? (
            <>
              <p>Aucun trip ne correspond à ces filtres.</p>
              <Link href="/jibli/trips" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
                Réinitialiser les filtres
              </Link>
            </>
          ) : (
            <p>Aucun trip publié pour l&apos;instant.</p>
          )}
        </div>
      )}

      {!error && trips && trips.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </main>
  )
}
