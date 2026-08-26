import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

export const metadata: Metadata = pageMetadata({
  title: 'Nouveau mot de passe',
  description: 'Choisis un nouveau mot de passe pour ton compte Livrily.',
  noIndex: true,
})

interface ResetPasswordPageProps {
  searchParams: Promise<{ email?: string }>
}

// Vérification par CODE (8 chiffres reçu par email), pas par lien cliquable
// — cf. lib/validations/auth.ts::resetPasswordSchema pour le contexte
// complet (click-tracking Resend/AWS SES qui pré-consommait le lien). Cette
// page n'est donc plus atteinte via /auth/callback : elle est directement
// accessible (email pré-rempli si on vient de /forgot-password), aucune
// session préalable requise — verifyOtp() dans l'action l'établit elle-même.
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { email } = await searchParams

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Heading level="h1">Nouveau mot de passe</Heading>
          <p className="mt-1 text-sm text-slate-500">
            Entre le code à 8 chiffres reçu par email et choisis un nouveau mot de passe.
          </p>
        </div>
        <Card>
          <ResetPasswordForm defaultEmail={email ?? ''} />
        </Card>
      </div>
    </div>
  )
}
