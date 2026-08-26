import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Luggage } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProposalsTabs } from '@/components/travel/ProposalsTabs'
import { pageMetadata } from '@/lib/seo'
import { EmptyState } from '@/components/ui/EmptyState'
import { Heading } from '@/components/ui/Typography'

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
      <Heading level="h1" className="mt-3">Mes propositions</Heading>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger tes propositions.</p>}

      {!error && proposals && proposals.length === 0 && (
        <EmptyState icon={Luggage}>
          <p>Tu n&apos;as encore fait aucune proposition.</p>
          <Link href="/jibli" className="mt-3 text-sm font-medium text-brand-600 hover:underline">
            Parcourir les demandes ouvertes
          </Link>
        </EmptyState>
      )}

      {!error && proposals && proposals.length > 0 && <ProposalsTabs proposals={proposals} requestById={requestById} />}
    </main>
  )
}
