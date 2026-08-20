import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ClipboardList, Bell, ShieldCheck, Laptop2, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getIdentityStatus, isIdentityVerified } from '@/lib/identity'
import { computeTrustLevel } from '@/lib/trustLevel'
import { COUNTRIES } from '@/lib/constants/countries'
import { AccountIdentityCard } from '@/components/account/AccountIdentityCard'
import { VerificationStepper } from '@/components/account/VerificationStepper'
import { PersonalInfoSummary } from '@/components/account/PersonalInfoSummary'
import { SecuritySection } from '@/components/account/SecuritySection'
import { DangerZone } from '@/components/account/DangerZone'
import { NotificationToggle } from '@/components/account/NotificationToggle'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Paramètres du compte',
  description: 'Identité, informations personnelles, sécurité et notifications de ton compte Livrily.',
  noIndex: true,
})

export default async function ParametresPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/profil/parametres')

  const [{ data: profile }, identityStatus] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, phone, country, address, profession, avatar_url, is_active')
      .eq('id', user.id)
      .single(),
    getIdentityStatus(supabase, user.id),
  ])

  if (!profile) redirect('/login?next=/profil/parametres')

  const emailVerified = Boolean(user.email_confirmed_at)
  const kycVerified = isIdentityVerified(identityStatus)
  const trust = computeTrustLevel(emailVerified, kycVerified)
  const countryLabel = COUNTRIES.find((c) => c.value === profile.country)?.label ?? profile.country ?? 'Non renseigné'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres du compte</h1>
          <p className="mt-1 text-sm text-slate-500">Identité, informations, sécurité et notifications.</p>
        </div>
        <Link href="/profil">
          <Button variant="secondary" size="sm">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            Mon activité
          </Button>
        </Link>
      </div>

      <div className="mt-6">
        <AccountIdentityCard
          fullName={profile.full_name}
          email={user.email ?? null}
          phone={profile.phone}
          avatarPath={profile.avatar_url}
          isActive={profile.is_active}
          emailVerified={emailVerified}
          kycVerified={kycVerified}
          trust={trust}
        />
      </div>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <ShieldAlert className="h-5 w-5 text-brand-600" aria-hidden />
          Vérification du compte
        </h2>
        <div className="mt-4">
          <VerificationStepper emailVerified={emailVerified} kycVerified={kycVerified} />
        </div>
      </Card>

      <div className="mt-4">
        <PersonalInfoSummary
          fullName={profile.full_name}
          countryLabel={countryLabel}
          address={profile.address}
          profession={profile.profession}
        />
      </div>

      <div className="mt-4">
        <CollapsibleSection icon={<Bell className="h-5 w-5" aria-hidden />} title="Notifications">
          <NotificationToggle />
        </CollapsibleSection>
      </div>

      <div className="mt-4">
        <CollapsibleSection icon={<ShieldCheck className="h-5 w-5" aria-hidden />} title="Sécurité">
          <SecuritySection email={user.email ?? null} phone={profile.phone} />
        </CollapsibleSection>
      </div>

      <div className="mt-4">
        <CollapsibleSection icon={<Laptop2 className="h-5 w-5" aria-hidden />} title="Appareils connectés" description="Bientôt disponible">
          <p className="text-sm text-slate-500">
            Le suivi des sessions actives par appareil arrive dans une prochaine mise à jour.
          </p>
        </CollapsibleSection>
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 font-semibold text-slate-900">Actions sensibles</h2>
        <DangerZone />
      </Card>
    </main>
  )
}
