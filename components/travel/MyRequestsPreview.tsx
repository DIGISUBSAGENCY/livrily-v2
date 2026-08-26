import Link from 'next/link'
import { Plane } from 'lucide-react'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import type { TravelRequest } from '@/types/database'
import { EmptyState } from '@/components/ui/EmptyState'
import { Heading } from '@/components/ui/Typography'

interface MyRequestsPreviewProps {
  requests: TravelRequest[]
  totalCount: number
}

// Version condensée de /jibli/mes-demandes (3 max + lien "voir tout") —
// même pattern d'état vide (icône + texte + CTA) que la page complète,
// pas dupliqué au hasard.
export function MyRequestsPreview({ requests, totalCount }: MyRequestsPreviewProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <Heading level="h3" as="h2">Mes demandes en cours</Heading>
        {totalCount > 0 && (
          <Link href="/jibli/mes-demandes" className="text-sm font-medium text-brand-600 hover:underline">
            Voir tout ({totalCount})
          </Link>
        )}
      </div>

      {requests.length === 0 && (
        <Card>
          <EmptyState icon={Plane} className="mt-0 py-4">
            <p>Tu n&apos;as encore publié aucune demande.</p>
            <Link href="/jibli/nouvelle-demande" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
              Publier une demande
            </Link>
          </EmptyState>
        </Card>
      )}

      {requests.length > 0 && (
        <div className="space-y-3">
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
    </section>
  )
}
