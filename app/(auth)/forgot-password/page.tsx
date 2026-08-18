import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mot de passe oublié',
  description: 'Réinitialise le mot de passe de ton compte Livrily.',
  noIndex: true,
})

// Même style que /login (dans le même groupe de routes (auth), donc même
// Header/Footer public) — cf. app/(admin-auth)/admin/forgot-password/page.tsx
// pour l'équivalent admin (thème sombre, chrome différent, volontairement).
export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mot de passe oublié</h1>
          <p className="mt-1 text-sm text-slate-500">
            Entre ton email, on t&apos;envoie un lien pour choisir un nouveau mot de passe.
          </p>
        </div>
        <Card>
          <ForgotPasswordForm />
        </Card>
      </div>
    </div>
  )
}
