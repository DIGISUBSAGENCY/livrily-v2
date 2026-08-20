import Link from 'next/link'
import { Plane, Search, PackageCheck, ClipboardList, Star, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatCard } from '@/components/ui/StatCard'
import { TrustPanel } from '@/components/profile/TrustPanel'
import type { ProfileStats } from '@/lib/profileStats'

interface ProfileOverviewProps {
  stats: ProfileStats
  emailVerified: boolean
  kycVerified: boolean
  memberSinceLabel: string
  userId: string
}

export function ProfileOverview({ stats, emailVerified, kycVerified, memberSinceLabel, userId }: ProfileOverviewProps) {
  const verificationsCompleted = (emailVerified ? 1 : 0) + (kycVerified ? 1 : 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={PackageCheck} value={stats.confirmedDeliveries} label="Livraisons confirmées" />
        <StatCard icon={ClipboardList} value={stats.activeRequests} label="Demandes actives" />
        {/* Pas de vraie note pour l'instant : ratings est scopé aux
            commerces, pas aux utilisateurs (aucune notation entre
            particuliers dans le schéma). Card statique en attendant. */}
        <StatCard icon={Star} value="Bientôt" label="Note moyenne" />
        <StatCard icon={ShieldCheck} value={`${verificationsCompleted}/2`} label="Vérifications" />
      </div>

      <TrustPanel emailVerified={emailVerified} kycVerified={kycVerified} />

      {/* Contenu de l'étape 1/3, conservé tel quel. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col items-start gap-2">
          <Search className="h-5 w-5 text-brand-600" aria-hidden />
          <p className="font-medium text-slate-900">Besoin de faire venir un objet ?</p>
          <p className="text-sm text-slate-500">Publie une demande, les voyageurs qui passent par ta destination te feront une offre.</p>
          <Link href="/jibli/nouvelle-demande">
            <Button size="sm" className="mt-1">Publier une demande</Button>
          </Link>
        </Card>

        <Card className="flex flex-col items-start gap-2">
          <Plane className="h-5 w-5 text-brand-600" aria-hidden />
          <p className="font-medium text-slate-900">Tu voyages bientôt ?</p>
          <p className="text-sm text-slate-500">Parcours les demandes ouvertes et propose de ramener un objet sur ton trajet.</p>
          <Link href="/jibli">
            <Button size="sm" variant="secondary" className="mt-1">Voir les demandes ouvertes</Button>
          </Link>
        </Card>
      </div>

      <p className="text-center text-xs text-slate-400">
        Membre depuis {memberSinceLabel} · Identifiant #{userId}
      </p>
    </div>
  )
}
