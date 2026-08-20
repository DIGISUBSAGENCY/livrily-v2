import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Pencil, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProfileCoverUpload } from '@/components/profile/ProfileCoverUpload'
import { ProfileAvatarUpload } from '@/components/profile/ProfileAvatarUpload'
import { ProfileBio } from '@/components/profile/ProfileBio'
import { ProfileTabs } from '@/components/profile/ProfileTabs'
import { ProfileOverview } from '@/components/profile/ProfileOverview'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Mon profil',
  description: 'Ton profil Livrily.',
  noIndex: true,
})

function memberSince(createdAt: string): string {
  const formatted = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(createdAt))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// /profil : consultation (cover, avatar, bio, tabs) — distinct de
// /profil/completer, qui reste le formulaire d'édition des informations de
// livraison (nom, téléphone, adresse…), accessible ici via un bouton.
export default async function ProfilPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/profil')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, cover_url, bio, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login?next=/profil')

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Card className="overflow-hidden p-0">
        <ProfileCoverUpload coverPath={profile.cover_url} editable />

        <div className="px-6 pb-6">
          <div className="-mt-14 flex items-end justify-between gap-3">
            <ProfileAvatarUpload
              fullName={profile.full_name}
              email={user.email ?? null}
              avatarPath={profile.avatar_url}
              editable
            />
            <Link href="/profil/completer">
              <Button variant="secondary" size="sm">
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Modifier mes informations
              </Button>
            </Link>
          </div>

          <h1 className="mt-3 text-xl font-bold tracking-tight text-slate-900">
            {profile.full_name || 'Utilisateur Livrily'}
          </h1>

          <ProfileBio bio={profile.bio} editable />

          <Badge tone="neutral" className="mt-3 gap-1.5">
            <CalendarDays className="h-3 w-3" aria-hidden />
            Membre depuis {memberSince(profile.created_at)}
          </Badge>
        </div>
      </Card>

      <ProfileTabs overview={<ProfileOverview />} />
    </div>
  )
}
