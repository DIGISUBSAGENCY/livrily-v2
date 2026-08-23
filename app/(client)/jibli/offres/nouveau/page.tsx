import type { Metadata } from 'next'
import Link from 'next/link'
import { ProductOfferForm } from '@/components/travel/ProductOfferForm'
import { IdentityProgressBar } from '@/components/account/IdentityProgressBar'
import { IdentityRequiredModal } from '@/components/account/IdentityRequiredModal'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { createClient } from '@/lib/supabase/server'
import { getIdentityStatus } from '@/lib/identity'

export const metadata: Metadata = pageMetadata({
  title: 'Publier une offre',
  description: 'Annonce un produit précis à un prix déjà fixé sur Livrily.',
  noIndex: true,
})

// Même pattern que trips/nouveau/page.tsx : pas de redirection si non
// connecté (la Server Action redirige déjà vers /login à la soumission),
// vérification d'identité obligatoire — cohérence avec demande/trip.
export default async function NewProductOfferPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const identityStatus = user ? await getIdentityStatus(supabase, user.id) : null

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <IdentityRequiredModal defaultOpen={identityStatus === 'unverified' || identityStatus === 'rejected'} />

      <Link href="/jibli/offres" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Offres
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Publier une offre</h1>
      <p className="mt-1 text-sm text-slate-500">
        Annonce un produit précis que tu proposes de ramener, avec ton prix — un client peut la
        prendre directement, sans négociation.
      </p>

      {identityStatus && identityStatus !== 'approved' && (
        <Card className="mt-6">
          <IdentityProgressBar status={identityStatus} />
          <p className="mt-3 text-sm text-slate-600">
            Ton identité doit être vérifiée avant de pouvoir publier une offre.
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
        <ProductOfferForm />
      </Card>
    </main>
  )
}
