import type { Metadata } from 'next'
import { AdminResetPasswordForm } from '@/components/auth/AdminResetPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Nouveau mot de passe — Admin',
  description: 'Choisis un nouveau mot de passe pour ton compte administrateur Livrily.',
  noIndex: true,
})

interface AdminResetPasswordPageProps {
  searchParams: Promise<{ email?: string }>
}

// Vérification par CODE OTP (pas par lien) — cf. lib/validations/auth.ts::
// resetPasswordSchema. Accessible sans session préalable (lib/supabase/
// middleware.ts l'exclut désormais du garde-fou admin) : verifyOtp() dans
// l'action établit la session elle-même, qui vérifie ensuite explicitement
// role === 'admin' avant d'autoriser le changement de mot de passe.
export default async function AdminResetPasswordPage({ searchParams }: AdminResetPasswordPageProps) {
  const { email } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold tracking-tight text-brand-700">
            Livrily{' '}
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Admin
            </span>
          </p>
          <Heading level="h1" className="mt-3">Nouveau mot de passe</Heading>
          <p className="mt-1 text-sm text-slate-500">
            Entre le code à 8 chiffres reçu par email et choisis un nouveau mot de passe.
          </p>
        </div>
        <Card>
          <AdminResetPasswordForm defaultEmail={email ?? ''} />
        </Card>
      </div>
    </div>
  )
}
