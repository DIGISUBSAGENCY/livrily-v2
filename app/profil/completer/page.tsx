import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/auth/ProfileForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Complète ton profil',
  description: 'Termine la configuration de ton compte Livrily.',
  noIndex: true,
})

export default async function CompleterProfilPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Déjà rempli pour un compte créé via Google (metadata OAuth) : évite de
  // retaper un nom que Google connaît déjà. Vide pour un compte email/mot
  // de passe classique (handle_new_user ne le renseigne pas).
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Complète ton profil</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ces informations servent à te livrer au bon endroit.
          </p>
        </div>
        <Card>
          <ProfileForm defaultFullName={profile?.full_name ?? ''} />
        </Card>
      </div>
    </div>
  )
}
