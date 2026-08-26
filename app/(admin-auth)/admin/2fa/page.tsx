import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getMfaStatus } from '@/lib/mfa'
import { MfaSetupForm } from '@/components/auth/MfaSetupForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { enrollAdminMfaFactor, verifyAdminMfaEnrollment } from './actions'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Activer la double authentification',
  description: 'Étape obligatoire pour les comptes administrateur Livrily.',
  noIndex: true,
})

interface Admin2faPageProps {
  searchParams: Promise<{ next?: string }>
}

// Route dédiée, hors du chrome dashboard (même raison que /admin/login) —
// destination du garde-fou middleware quand un admin n'a encore aucun
// facteur MFA vérifié. Si l'admin a déjà un facteur (juste pas encore
// stepped-up sur CETTE session), le middleware envoie plutôt vers
// /admin/2fa/verifier — redirigé ici en défense en profondeur si quelqu'un
// arrive directement sur cette URL dans ce cas.
export default async function Admin2faPage({ searchParams }: Admin2faPageProps) {
  const { next } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const status = await getMfaStatus(supabase)
  if (status.hasVerifiedFactor) {
    redirect(next && next.startsWith('/admin') ? `/admin/2fa/verifier?next=${encodeURIComponent(next)}` : '/admin/2fa/verifier')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-brand-400" aria-hidden />
          <Heading level="h1" className="mt-3">Double authentification requise</Heading>
          <p className="mt-1 text-sm text-slate-500">
            Obligatoire pour les comptes administrateur Livrily — à activer avant de continuer.
          </p>
        </div>
        <Card>
          <MfaSetupForm enrollAction={enrollAdminMfaFactor} verifyAction={verifyAdminMfaEnrollment.bind(null, next)} />
        </Card>
      </div>
    </div>
  )
}
