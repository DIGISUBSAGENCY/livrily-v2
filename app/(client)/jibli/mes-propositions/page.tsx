import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Luggage } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { TravelProposalStatusBadge } from '@/components/travel/TravelProposalStatusBadge'
import { ProposalAmounts } from '@/components/travel/ProposalAmounts'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mes propositions',
  description: 'Tes propositions de crowd-shipping en tant que voyageur sur Livrily.',
  noIndex: true,
})

export default async function MyProposalsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/jibli/mes-propositions')

  const { data: proposals, error } = await supabase
    .from('travel_proposals')
    .select('*')
    .eq('voyageur_id', user.id)
    .order('created_at', { ascending: false })

  const requestIds = Array.from(new Set((proposals ?? []).map((p) => p.request_id)))
  const { data: requests } = requestIds.length
    ? await supabase.from('travel_requests').select('id, item_description, status').in('id', requestIds)
    : { data: [] }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Jibli chay men l&apos;a5er
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Mes propositions</h1>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger tes propositions.</p>}

      {!error && proposals && proposals.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Luggage className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Tu n&apos;as encore fait aucune proposition.</p>
          <Link href="/jibli" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
            Parcourir les demandes ouvertes
          </Link>
        </div>
      )}

      {!error && proposals && proposals.length > 0 && (
        <div className="mt-6 space-y-3">
          {proposals.map((proposal) => {
            const request = requestById.get(proposal.request_id)
            return (
              <Link key={proposal.id} href={`/jibli/${proposal.request_id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900">{request?.item_description ?? 'Demande'}</p>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <TravelProposalStatusBadge status={proposal.status} />
                      {request && <TravelRequestStatusBadge status={request.status} />}
                    </div>
                  </div>
                  <div className="mt-2">
                    <ProposalAmounts itemPrice={proposal.item_price} deliveryFee={proposal.delivery_fee} />
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
