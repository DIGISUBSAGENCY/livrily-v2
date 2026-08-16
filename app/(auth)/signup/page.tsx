import type { Metadata } from 'next'
import { SignupForm } from '@/components/auth/SignupForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Créer un compte</h1>
          <p className="mt-1 text-sm text-slate-500">Commande sur Livrily en quelques minutes.</p>
        </div>
        <Card>
          <SignupForm defaultReferralCode={ref ?? ''} />
        </Card>
      </div>
    </div>
  )
}
