import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reset?: string }>
}

export const metadata: Metadata = pageMetadata({
  title: 'Connexion',
  description: 'Connecte-toi à ton compte Livrily.',
  noIndex: true,
})

// `error` vient d'une redirection depuis /auth/callback (confirmation email
// ou OAuth Google en échec) — affiché tel quel pour l'instant : ce n'est pas
// une donnée utilisateur sensible, juste un code/message d'erreur GoTrue,
// utile pour diagnostiquer sans avoir à lire les logs serveur. `reset` vient
// de /reset-password après un changement de mot de passe réussi.
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, reset } = await searchParams

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Heading level="h1">Connexion</Heading>
          <p className="mt-1 text-sm text-slate-500">Accède à ton compte Livrily.</p>
        </div>
        {error && (
          <Alert tone="danger" className="mb-4">
            La connexion a échoué : {decodeURIComponent(error)}
          </Alert>
        )}
        {reset === 'success' && (
          <Alert tone="success" className="mb-4">
            Mot de passe mis à jour. Connecte-toi avec ton nouveau mot de passe.
          </Alert>
        )}
        <Card>
          <LoginForm />
        </Card>
      </div>
    </div>
  )
}
