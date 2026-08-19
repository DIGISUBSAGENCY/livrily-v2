import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { VerificationForm } from '@/components/account/VerificationForm'
import { IdentityStatusBadge } from '@/components/account/IdentityStatusBadge'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { pageMetadata } from '@/lib/seo'
import type { IdentityGateStatus } from '@/lib/identity'

export const metadata: Metadata = pageMetadata({
  title: "Vérification d'identité",
  description: 'Vérifie ton identité pour publier une demande ou accepter une offre sur Livrily.',
  noIndex: true,
})

// Pourquoi cette vérification (texte repris de l'étape 2 de l'onboarding,
// même explication partout) : elle sert à générer un contrat entre le
// client, le voyageur et Livrily, qui protège les deux parties en cas de
// litige — pas une formalité administrative gratuite.
export default async function VerificationIdentitePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/profil/verification-identite')

  const { data: verification } = await supabase
    .from('identity_verifications')
    .select('status, rejection_reason')
    .eq('profile_id', user.id)
    .maybeSingle()

  const status: IdentityGateStatus = verification?.status ?? 'unverified'

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
          <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden />
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Vérification d&apos;identité</h1>
        <p className="mt-2 text-sm text-slate-500">
          Cette vérification (~2 min) sert à générer un contrat entre toi, le voyageur et Livrily,
          qui protège les deux parties en cas de litige. Obligatoire avant de publier une demande
          ou d&apos;accepter une offre.
        </p>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Statut actuel</span>
          <IdentityStatusBadge status={status} />
        </div>

        {status === 'approved' ? (
          <p className="text-sm text-slate-600">
            Ton identité est vérifiée — tu peux publier des demandes et accepter des offres
            normalement.
          </p>
        ) : (
          <>
            {status === 'rejected' && verification?.rejection_reason && (
              <Alert tone="danger" className="mb-4">
                Raison du refus : {verification.rejection_reason}
              </Alert>
            )}
            {status === 'pending' && (
              <p className="mb-4 text-sm text-slate-600">
                Ta vérification est en cours d&apos;examen. Tu peux la renvoyer si tu t&apos;es
                trompé de document.
              </p>
            )}
            <VerificationForm />
          </>
        )}
      </Card>
    </div>
  )
}
