import type { Metadata } from 'next'
import { AdminForgotPasswordForm } from '@/components/auth/AdminForgotPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mot de passe oublié — Admin',
  description: 'Réinitialise le mot de passe de ton compte administrateur Livrily.',
  noIndex: true,
})

// Même isolement que /admin/login (app/(admin-auth)/...) : pas de chrome
// dashboard ni public.
export default function AdminForgotPasswordPage() {
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
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Mot de passe oublié</h1>
          <p className="mt-1 text-sm text-slate-400">
            Entre ton email, on t&apos;envoie un lien pour choisir un nouveau mot de passe.
          </p>
        </div>
        <Card>
          <AdminForgotPasswordForm />
        </Card>
      </div>
    </div>
  )
}
