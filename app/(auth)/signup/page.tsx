import type { Metadata } from 'next'
import { SignupForm } from '@/components/auth/SignupForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

interface SignupPageProps {
  searchParams: Promise<{ ref?: string }>
}

export const metadata: Metadata = pageMetadata({
  title: 'Créer un compte',
  description: 'Crée ton compte Livrily et commande en quelques minutes.',
  noIndex: true,
})

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { ref } = await searchParams

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Heading level="h1">Créer un compte</Heading>
          <p className="mt-1 text-sm text-slate-500">Commande sur Livrily en quelques minutes.</p>
        </div>
        <Card>
          <SignupForm defaultReferralCode={ref ?? ''} />
        </Card>
      </div>
    </div>
  )
}
