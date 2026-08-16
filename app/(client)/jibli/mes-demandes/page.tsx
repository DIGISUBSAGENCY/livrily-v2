import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plane } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mes demandes',
  description: 'Tes demandes de crowd-shipping publiées sur Livrily.',
  noIndex: true,
})

export default async function MyTravelRequestsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/mes-demandes')

  const { data: requests, error } = await supabase
    .from('travel_requests')
    .select('*')
    .eq('client_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Jibli chay men l&apos;a5er
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Mes demandes</h1>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger tes demandes.</p>}

      {!error && requests && requests.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Plane className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Tu n&apos;as encore publié aucune demande.</p>
          <Link href="/jibli/nouvelle-demande" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
            Publier une demande
          </Link>
        </div>
      )}

      {!error && requests && requests.length > 0 && (
        <div className="mt-6 space-y-3">
          {requests.map((request) => (
            <Link key={request.id} href={`/jibli/${request.id}`}>
              <Card className="flex items-center justify-between gap-4 transition-shadow hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{request.item_description}</p>
                  <p className="text-xs text-slate-500">
                    {request.origin_country} → {request.destination_city} · {formatTND(request.budget_max)}
                  </p>
                </div>
                <TravelRequestStatusBadge status={request.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
