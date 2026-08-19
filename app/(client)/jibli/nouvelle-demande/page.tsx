import type { Metadata } from 'next'
import Link from 'next/link'
import { RequestForm } from '@/components/travel/RequestForm'
import { IdentityProgressBar } from '@/components/account/IdentityProgressBar'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import { getIdentityStatus } from '@/lib/identity'

export const metadata: Metadata = pageMetadata({
  title: 'Publier une demande',
  description: 'Décris ce que tu veux qu’on te ramène de l’étranger sur Livrily.',
  noIndex: true,
})

// Pas de redirection si non connecté (comme /jibli/[id]) : la Server
// Action redirige déjà vers /login à la soumission. La barre de
// progression identité n'a de sens que pour un compte déjà connecté.
export default async function NewTravelRequestPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const identityStatus = user ? await getIdentityStatus(supabase, user.id) : null

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

      {identityStatus && identityStatus !== 'approved' && (
        <Card className="mt-6">
          <IdentityProgressBar status={identityStatus} />
          <p className="mt-3 text-sm text-slate-600">
            Ton identité doit être vérifiée avant de pouvoir publier une demande.
          </p>
          <Link
            href="/profil/verification-identite"
            className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            {identityStatus === 'pending' ? 'Voir ma vérification' : 'Vérifier mon identité'}
          </Link>
        </Card>
      )}

      <Card className="mt-6">
        <RequestForm />
      </Card>
    </main>
  )
}
