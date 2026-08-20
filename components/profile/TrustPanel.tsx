import Link from 'next/link'
import { CheckCircle2, Circle, Mail, ShieldCheck, Lock } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface TrustPanelProps {
  emailVerified: boolean
  kycVerified: boolean
}

// "Paiements sécurisés" est statique (toujours ✓, décision produit) : c'est
// une garantie structurelle de la plateforme (paiement séquestré, cf.
// IdentityRequiredModal.tsx), pas un état par utilisateur — rien à vérifier
// côté profil. Le bouton ne cible que la vérification d'identité : c'est la
// seule des deux cases manquantes pour laquelle un flow de complétion
// existe réellement (aucun renvoi d'email de confirmation en libre-service
// pour un compte déjà créé, cf. lacune notée côté audit).
export function TrustPanel({ emailVerified, kycVerified }: TrustPanelProps) {
  const items = [
    { label: 'Adresse email', done: emailVerified, icon: Mail },
    { label: 'Identité (KYC)', done: kycVerified, icon: ShieldCheck },
    { label: 'Paiements sécurisés', done: true, icon: Lock },
  ]
  const allDone = items.every((item) => item.done)

  return (
    <Card>
      <p className="font-medium text-slate-900">Confiance & sécurité</p>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 flex-shrink-0 text-slate-300" aria-hidden />
            )}
            <item.icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden />
            <span className={cn(item.done ? 'text-slate-700' : 'text-slate-400')}>{item.label}</span>
          </li>
        ))}
      </ul>

      {!allDone && (
        <Link href="/profil/verification-identite">
          <Button size="sm" className="mt-4">
            Compléter mes vérifications
          </Button>
        </Link>
      )}
    </Card>
  )
}
