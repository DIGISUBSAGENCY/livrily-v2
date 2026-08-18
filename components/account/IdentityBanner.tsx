import Link from 'next/link'
import { ShieldAlert, Clock, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { IdentityGateStatus } from '@/lib/identity'

interface IdentityBannerProps {
  status: IdentityGateStatus
  rejectionReason?: string | null
}

// Rien à afficher une fois vérifié — c'est tout le but du bandeau, il
// disparaît une fois le compte "complété". Affiché sur /jibli (dashboard,
// priorité 2) tant que status !== 'approved'.
export function IdentityBanner({ status, rejectionReason }: IdentityBannerProps) {
  if (status === 'approved') return null

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Clock className="h-5 w-5 flex-shrink-0" aria-hidden />
        <p>Ta vérification d&apos;identité est en cours d&apos;examen — tu seras notifié une fois traitée.</p>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="flex items-start gap-3">
          <ShieldX className="h-5 w-5 flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Vérification d&apos;identité refusée</p>
            {rejectionReason && <p className="mt-1 text-red-700">{rejectionReason}</p>}
          </div>
        </div>
        <Link href="/profil/verification-identite" className="mt-3 inline-block">
          <Button size="sm" variant="danger">
            Réessayer
          </Button>
        </Link>
      </div>
    )
  }

  // status === 'unverified'
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 flex-shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Compte à compléter</p>
          <p className="text-amber-700">
            Vérifie ton identité avant de publier une demande ou d&apos;accepter une offre.
          </p>
        </div>
      </div>
      <Link href="/profil/verification-identite">
        <Button size="sm">Vérifier mon identité</Button>
      </Link>
    </div>
  )
}
