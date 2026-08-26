import type { Metadata } from 'next'
import { AdminForgotPasswordForm } from '@/components/auth/AdminForgotPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Mot de passe oublié — Admin',
  description: 'Réinitialise le mot de passe de ton compte administrateur Livrily.',
  noIndex: true,
})

// Même isolement que /admin/login (app/(admin-auth)/...) : pas de chrome
// dashboard ni public.
export default function AdminForgotPasswordPage() {
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
          <Heading level="h1" className="mt-3">Mot de passe oublié</Heading>
          <p className="mt-1 text-sm text-slate-500">
            Entre ton email, on t&apos;envoie un code à 8 chiffres pour choisir un nouveau mot de
            passe.
          </p>
        </div>
        <Card>
          <AdminForgotPasswordForm />
        </Card>
      </div>
    </div>
  )
}
