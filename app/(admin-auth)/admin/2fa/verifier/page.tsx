import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getMfaStatus } from '@/lib/mfa'
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { verifyAdminMfaChallenge } from './actions'

export const metadata: Metadata = pageMetadata({
  title: 'Vérification en 2 étapes',
  description: 'Confirme ta connexion administrateur Livrily.',
  noIndex: true,
})

interface Admin2faVerifierPageProps {
  searchParams: Promise<{ next?: string }>
}

// Destination du garde-fou middleware quand un admin a déjà un facteur MFA
// vérifié mais que CETTE session n'a pas encore été step-up (aal1 malgré
// un facteur existant) — nouvelle connexion typiquement. Si aucun facteur
// n'existe (jamais enrôlé), redirigé vers /admin/2fa à la place — défense
// en profondeur si quelqu'un arrive directement sur cette URL.
export default async function Admin2faVerifierPage({ searchParams }: Admin2faVerifierPageProps) {
  const { next } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const status = await getMfaStatus(supabase)
  if (!status.hasVerifiedFactor || !status.factorId) {
    redirect(next ? `/admin/2fa?next=${encodeURIComponent(next)}` : '/admin/2fa')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-brand-400" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Vérification en 2 étapes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Entre le code affiché dans ton application d&apos;authentification.
          </p>
        </div>
        <Card>
          <MfaChallengeForm
            factorId={status.factorId}
            verifyAction={(factorId, code) => verifyAdminMfaChallenge(factorId, code, next)}
          />
        </Card>
      </div>
    </div>
  )
}
