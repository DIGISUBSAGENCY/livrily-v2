import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Vérifie ta boîte mail',
  description: 'Confirme ton compte Livrily via le lien reçu par email.',
  noIndex: true,
})

interface VerificationEnvoyeePageProps {
  searchParams: Promise<{ email?: string }>
}

// L'email vient du formulaire d'inscription, transmis par signUp() via un
// paramètre d'URL sur le redirect() final (cf. app/(auth)/actions.ts) —
// aucun état serveur partagé entre les deux pages, donc pas d'autre moyen
// simple de le faire traverser la redirection. Absent (accès direct à
// l'URL, lien partagé...), le message retombe sur une formulation générique.
export default async function VerificationEnvoyeePage({ searchParams }: VerificationEnvoyeePageProps) {
  const { email } = await searchParams

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm text-center">
        <MailCheck className="mx-auto mb-4 h-10 w-10 text-brand-600" aria-hidden />
        <h1 className="text-xl font-semibold text-slate-900">Vérifie ta boîte mail</h1>
        <p className="mt-2 text-sm text-slate-600">
          On t&apos;a envoyé un lien de confirmation
          {email ? (
            <>
              {' '}
              à <span className="font-semibold text-brand-700">{email}</span>
            </>
          ) : null}
          . Clique dessus pour activer ton compte, puis reviens te connecter.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline">
          Retour à la connexion
        </Link>
      </Card>
    </div>
  )
}
