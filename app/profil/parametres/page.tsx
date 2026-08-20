import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm'
import { NotificationToggle } from '@/components/account/NotificationToggle'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Paramètres du compte',
  description: 'Mot de passe et notifications de ton compte Livrily.',
  noIndex: true,
})

export default async function ParametresPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/profil/parametres')

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres du compte</h1>
      <p className="mt-1 text-sm text-slate-500">Mot de passe et notifications.</p>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-slate-900">Mot de passe</h2>
        <ChangePasswordForm />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold text-slate-900">Notifications</h2>
        <NotificationToggle />
      </Card>
    </main>
  )
}
