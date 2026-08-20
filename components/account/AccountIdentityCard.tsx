import Link from 'next/link'
import { ShieldCheck, ShieldAlert, Lock, BadgeCheck, Headset, Receipt, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import type { TrustLevel } from '@/lib/trustLevel'
import { getPublicStorageUrl } from '@/lib/storage'

interface AccountIdentityCardProps {
  fullName: string | null
  email: string | null
  phone: string | null
  avatarPath: string | null
  isActive: boolean
  emailVerified: boolean
  kycVerified: boolean
  trust: TrustLevel
}

// 4 piliers statiques de la plateforme (pas des cases par utilisateur) —
// même registre que les badges de confiance de la homepage
// (app/(client)/page.tsx), gardés distincts des 2 vraies pills par-compte
// juste au-dessus (email/identité).
const trustPillars = [
  { icon: Lock, label: 'Compte sécurisé' },
  { icon: ShieldCheck, label: 'Transactions fiables' },
  { icon: BadgeCheck, label: 'Identité vérifiée' },
  { icon: Headset, label: 'Support dédié' },
]

function getInitial(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

export function AccountIdentityCard({
  fullName,
  email,
  phone,
  avatarPath,
  isActive,
  emailVerified,
  kycVerified,
  trust,
}: AccountIdentityCardProps) {
  const initial = getInitial(fullName, email)
  const avatarUrl = avatarPath ? getPublicStorageUrl('profile-photos', avatarPath) : null
  // Cercle de progression en CSS pur (conic-gradient), pas de dépendance
  // SVG supplémentaire pour un seul indicateur — cohérent avec le reste du
  // projet qui n'a pas de lib de charts. #0D6E4E = brand-600 (tailwind.config.ts).
  const circleStyle = {
    background: `conic-gradient(#0D6E4E ${trust.percent * 3.6}deg, #e2e8f0 0deg)`,
  }

  return (
    <Card>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-lg font-semibold text-white">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={fullName ?? 'Avatar'} className="h-full w-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight text-slate-900">{fullName || 'Utilisateur Livrily'}</p>
            <p className="truncate text-sm text-slate-500">{email ?? 'Email non renseigné'}</p>
            <p className="truncate text-sm text-slate-500">{phone || 'Téléphone non renseigné'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={emailVerified ? 'success' : 'neutral'}>{emailVerified ? 'Email vérifié' : 'Email non vérifié'}</Badge>
              <Badge tone={kycVerified ? 'success' : 'warning'}>{kycVerified ? 'Identité vérifiée' : 'Identité à vérifier'}</Badge>
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3 self-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={circleStyle}
            role="img"
            aria-label={`Niveau de confiance : ${trust.percent}%`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-900">
              {trust.percent}%
            </div>
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-900">Niveau de confiance</p>
            <p className="text-slate-500">{trust.label}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-100 pt-4 text-sm">
        <p className="flex items-center gap-1.5">
          <span className="text-slate-500">Statut du compte :</span>
          <Badge tone={isActive ? 'success' : 'danger'}>{isActive ? 'Actif' : 'Inactif'}</Badge>
        </p>
        <p className="text-slate-500">
          Niveau de confiance : <span className="font-medium text-slate-700">{trust.label}</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
        {trustPillars.map((pillar) => (
          <div key={pillar.label} className="flex items-center gap-2 text-xs text-slate-600">
            <pillar.icon className="h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
            {pillar.label}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <Link href="/profil/completer">
          <Button variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Modifier le profil
          </Button>
        </Link>
        <Link href="/profil">
          <Button variant="secondary" size="sm">
            <Receipt className="h-3.5 w-3.5" aria-hidden />
            Voir mes transactions
          </Button>
        </Link>
      </div>

      {!kycVerified && (
        <Alert tone="warning" icon={ShieldAlert} className="mt-4">
          Sur Livrily, la livraison se fait directement entre client et voyageur, sans
          intermédiaire — le paiement reste séquestré jusqu&apos;à la confirmation de réception.
          Vérifie ton identité pour pouvoir publier une demande ou accepter une offre.
        </Alert>
      )}
    </Card>
  )
}
