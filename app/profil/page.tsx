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
import { getProfileStats } from '@/lib/profileStats'
import { getIdentityStatus, isIdentityVerified } from '@/lib/identity'
import { getProfileRating } from '@/lib/reviews'

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

  const [stats, identityStatus, rating] = await Promise.all([
    getProfileStats(supabase, user.id),
    getIdentityStatus(supabase, user.id),
    getProfileRating(supabase, user.id),
  ])

  // Avis reçus : la policy travel_reviews_select_involved gère elle-même le
  // double aveugle (reviewee_id = auth.uid() ne remonte que les avis déjà
  // révélés) — rien à filtrer de plus ici. Deux temps (pas de jointure
  // PostgREST embarquée) : même convention que le reste de l'app (cf.
  // /admin/litiges).
  const { data: reviewRows } = await supabase
    .from('travel_reviews')
    .select('id, rating, comment, reviewer_id, created_at')
    .eq('reviewee_id', user.id)
    .order('created_at', { ascending: false })

  const reviewerIds = Array.from(new Set((reviewRows ?? []).map((r) => r.reviewer_id)))
  const { data: reviewers } = reviewerIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', reviewerIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const reviewerNameById = new Map((reviewers ?? []).map((r) => [r.id, r.full_name]))

  const reviews = (reviewRows ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    reviewerName: reviewerNameById.get(r.reviewer_id) ?? 'Utilisateur',
  }))

  const emailVerified = Boolean(user.email_confirmed_at)
  const kycVerified = isIdentityVerified(identityStatus)
  const memberSinceLabel = memberSince(profile.created_at)

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
            Membre depuis {memberSinceLabel}
          </Badge>
        </div>
      </Card>

      <ProfileTabs
        overview={
          <ProfileOverview
            stats={stats}
            emailVerified={emailVerified}
            kycVerified={kycVerified}
            memberSinceLabel={memberSinceLabel}
            userId={user.id}
            rating={rating}
          />
        }
        reviews={reviews}
      />
    </div>
  )
}
