import type { Metadata } from 'next'
import { AdminResetPasswordForm } from '@/components/auth/AdminResetPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Nouveau mot de passe — Admin',
  description: 'Choisis un nouveau mot de passe pour ton compte administrateur Livrily.',
  noIndex: true,
})

// Atteinte uniquement via le lien reçu par email (/admin/forgot-password →
// /auth/callback?next=/admin/reset-password), qui établit une session de
// récupération. Le middleware protège déjà cette route comme le reste de
// /admin/* : sans session admin valide, on n'y arrive jamais (redirection
// vers /admin/login).
export default function AdminResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold tracking-tight text-white">
            Livrily{' '}
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              Admin
            </span>
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Nouveau mot de passe</h1>
          <p className="mt-1 text-sm text-slate-400">Choisis un nouveau mot de passe pour ton compte admin.</p>
        </div>
        <Card>
          <AdminResetPasswordForm />
        </Card>
      </div>
    </div>
  )
}
