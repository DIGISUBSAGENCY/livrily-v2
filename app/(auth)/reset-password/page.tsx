import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Nouveau mot de passe',
  description: 'Choisis un nouveau mot de passe pour ton compte Livrily.',
  noIndex: true,
})

// Atteinte uniquement via le lien reçu par email (/forgot-password →
// /auth/callback?next=/reset-password), qui établit une session de
// récupération. Contrairement à /admin/reset-password, cette route n'est
// PAS sous /admin/* : le middleware (lib/supabase/middleware.ts) ne la
// gate donc pas du tout — updateUser() dans l'action échoue simplement si
// jamais aucune session n'est présente.
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nouveau mot de passe</h1>
          <p className="mt-1 text-sm text-slate-500">Choisis un nouveau mot de passe pour ton compte.</p>
        </div>
        <Card>
          <ResetPasswordForm />
        </Card>
      </div>
    </div>
  )
}
