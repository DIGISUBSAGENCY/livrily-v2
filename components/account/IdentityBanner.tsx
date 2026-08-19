import Link from 'next/link'
import { ShieldAlert, Clock, ShieldX } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
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
      <Alert tone="warning" icon={Clock}>
        Ta vérification d&apos;identité est en cours d&apos;examen — tu seras notifié une fois traitée.
      </Alert>
    )
  }

  if (status === 'rejected') {
    return (
      <Alert tone="danger" icon={ShieldX} title="Vérification d'identité refusée">
        {rejectionReason && <p>{rejectionReason}</p>}
        <Link href="/profil/verification-identite" className="mt-3 inline-block">
          <Button size="sm" variant="danger">
            Réessayer
          </Button>
        </Link>
      </Alert>
    )
  }

  // status === 'unverified'
  return (
    <Alert tone="warning" icon={ShieldAlert} title="Compte à compléter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>Vérifie ton identité avant de publier une demande ou d&apos;accepter une offre.</p>
        <Link href="/profil/verification-identite">
          <Button size="sm">Vérifier mon identité</Button>
        </Link>
      </div>
    </Alert>
  )
}
