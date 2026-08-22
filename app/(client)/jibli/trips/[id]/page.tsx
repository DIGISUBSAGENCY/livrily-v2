import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plane, Weight, Wallet, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TripStatusBadge } from '@/components/travel/TripStatusBadge'
import { RequestMatchesPanel } from '@/components/travel/RequestMatchesPanel'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { formatTND } from '@/lib/format'

interface TripPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TripPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: trip } = await supabase.from('trips').select('origin_country, destination_city').eq('id', id).single()

  if (!trip) {
    return pageMetadata({ title: 'Trip introuvable', description: 'Ce trip est introuvable.' })
  }

  return pageMetadata({
    title: `${trip.origin_country} → ${trip.destination_city}`,
    description: `Trip publié sur Livrily : ${trip.origin_country} → ${trip.destination_city}.`,
  })
}

// Route + capacité + statut, et pour le propriétaire (voyageur) le
// panneau de matches (RequestMatchesPanel) avec le bouton "Proposer".
export default async function TripPage({ params }: TripPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: trip, error } = await supabase.from('trips').select('*').eq('id', id).single()
  if (error || !trip) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isOwner = user?.id === trip.voyageur_id

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli/trips" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Trips
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Plane className="h-6 w-6 text-brand-600" aria-hidden />
          {trip.origin_country} → {trip.destination_city}
        </h1>
        <TripStatusBadge status={trip.status} />
      </div>

      <Card className="mt-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Date de voyage
            </dt>
            <dd className="mt-0.5 text-sm text-slate-900">{new Date(trip.travel_date).toLocaleDateString('fr-TN')}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              <Weight className="h-3.5 w-3.5" aria-hidden /> Poids disponible
            </dt>
            <dd className="mt-0.5 text-sm text-slate-900">{trip.available_weight_kg} kg</dd>
          </div>
          {trip.indicative_price !== null && (
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                <Wallet className="h-3.5 w-3.5" aria-hidden /> Prix indicatif
              </dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                {formatTND(trip.indicative_price)} — point de départ, négociable une fois en contact
              </dd>
            </div>
          )}
          {trip.pickup_city && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Ville de départ</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{trip.pickup_city}</dd>
            </div>
          )}
        </dl>

        {trip.message && (
          <p className="mt-4 whitespace-pre-wrap border-t border-slate-100 pt-4 text-sm text-slate-700">{trip.message}</p>
        )}
      </Card>

      {isOwner && trip.status === 'open' && <RequestMatchesPanel tripId={trip.id} />}
    </main>
  )
}
