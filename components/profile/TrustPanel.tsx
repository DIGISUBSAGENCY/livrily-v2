import Link from 'next/link'
import { CheckCircle2, Circle, Mail, ShieldCheck, Lock, Award } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { TrustCategoryBadge } from '@/components/profile/TrustCategoryBadge'
import { TRUST_BADGE_LABELS, type TrustBadge, type TrustCategory } from '@/lib/trust'

interface TrustPanelProps {
  emailVerified: boolean
  kycVerified: boolean
  // Optionnel : cet écran reste utilisable (ex. pendant un rendu partiel)
  // même sans le Trust Score — seul le checklist d'origine s'affiche alors.
  trustCategory?: TrustCategory
  trustBadges?: TrustBadge[]
}

// "Paiements sécurisés" est statique (toujours ✓, décision produit) : c'est
// une garantie structurelle de la plateforme (paiement séquestré, cf.
// IdentityRequiredModal.tsx), pas un état par utilisateur — rien à vérifier
// côté profil. Le bouton ne cible que la vérification d'identité : c'est la
// seule des deux cases manquantes pour laquelle un flow de complétion
// existe réellement (aucun renvoi d'email de confirmation en libre-service
// pour un compte déjà créé, cf. lacune notée côté audit).
export function TrustPanel({ emailVerified, kycVerified, trustCategory, trustBadges = [] }: TrustPanelProps) {
  const items = [
    { label: 'Adresse email', done: emailVerified, icon: Mail },
    { label: 'Identité (KYC)', done: kycVerified, icon: ShieldCheck },
    { label: 'Paiements sécurisés', done: true, icon: Lock },
  ]
  const allDone = items.every((item) => item.done)

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">Confiance & sécurité</p>
        {trustCategory && <TrustCategoryBadge category={trustCategory} size="md" />}
      </div>

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

      {trustBadges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {trustBadges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"
            >
              <Award className="h-3 w-3 flex-shrink-0 text-slate-400" aria-hidden />
              {TRUST_BADGE_LABELS[badge]}
            </span>
          ))}
        </div>
      )}

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
