import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/auth/ProfileForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'
import { Heading } from '@/components/ui/Typography'

// Retitré "Mes informations" (était "Mon profil") : /profil (la nouvelle
// page de consultation) porte désormais ce nom-là — garder les deux
// identiques aurait été confus, notamment dans le fil d'Ariane/historique.
export const metadata: Metadata = pageMetadata({
  title: 'Mes informations',
  description: 'Consulte et modifie les informations de ton compte Livrily.',
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
  // de passe classique (handle_new_user ne le renseigne pas). country/
  // profession sont repris tels quels si l'utilisateur revient sur cette
  // page après une première tentative (évite de perdre sa saisie).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, country, profession')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-gradient-to-b from-brand-50/50 to-white px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Heading level="h1">Mes informations</Heading>
          <p className="mt-1 text-sm text-slate-500">
            Ces informations servent à te livrer au bon endroit — modifie-les à tout moment.
          </p>
        </div>
        <Card>
          <ProfileForm
            defaultFullName={profile?.full_name ?? ''}
            defaultCountry={profile?.country ?? 'TN'}
            defaultProfession={profile?.profession ?? ''}
          />
        </Card>
      </div>
    </div>
  )
}
