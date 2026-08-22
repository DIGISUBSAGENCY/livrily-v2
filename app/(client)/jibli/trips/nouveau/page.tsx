import type { Metadata } from 'next'
import Link from 'next/link'
import { TripForm } from '@/components/travel/TripForm'
import { IdentityProgressBar } from '@/components/account/IdentityProgressBar'
import { IdentityRequiredModal } from '@/components/account/IdentityRequiredModal'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import { getIdentityStatus } from '@/lib/identity'

export const metadata: Metadata = pageMetadata({
  title: 'Publier un trip',
  description: 'Annonce ta prochaine disponibilité de voyage sur Livrily et rentabilise-la.',
  noIndex: true,
})

// Même pattern que nouvelle-demande/page.tsx : pas de redirection si non
// connecté (la Server Action redirige déjà vers /login à la soumission),
// vérification d'identité obligatoire — décidé explicitement, cohérence
// avec la création de demande.
export default async function NewTripPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const identityStatus = user ? await getIdentityStatus(supabase, user.id) : null

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <IdentityRequiredModal defaultOpen={identityStatus === 'unverified' || identityStatus === 'rejected'} />

      <Link href="/jibli/trips" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Trips
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Publier un trip</h1>
      <p className="mt-1 text-sm text-slate-500">
        Annonce ta route et ta date de voyage à l&apos;avance — les clients dont une demande
        correspond pourront te la signaler, et tu pourras leur proposer de t&apos;en charger.
      </p>

      {identityStatus && identityStatus !== 'approved' && (
        <Card className="mt-6">
          <IdentityProgressBar status={identityStatus} />
          <p className="mt-3 text-sm text-slate-600">
            Ton identité doit être vérifiée avant de pouvoir publier un trip.
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
        <TripForm />
      </Card>
    </main>
  )
}
