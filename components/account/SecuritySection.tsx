import { Mail, Phone, KeyRound, ShieldQuestion } from 'lucide-react'
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm'

interface SecuritySectionProps {
  email: string | null
  phone: string | null
}

// Lignes lecture seule + formulaire de changement de mot de passe déjà
// fonctionnel (ChangePasswordForm, inchangé), réintégrés ici dans le bloc
// collapsible "Sécurité". 2FA affichée honnêtement comme non disponible —
// aucune double authentification construite, pas de faux badge "actif".
export function SecuritySection({ email, phone }: SecuritySectionProps) {
  const rows = [
    { icon: Mail, label: 'Email', value: email ?? 'Non renseigné' },
    { icon: Phone, label: 'Téléphone', value: phone || 'Non renseigné' },
    { icon: KeyRound, label: 'Mot de passe', value: '••••••••' },
    { icon: ShieldQuestion, label: 'Double authentification (2FA)', value: 'Non disponible' },
  ]

  return (
    <div className="space-y-6">
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <dt className="flex items-center gap-2 text-slate-500">
              <row.icon className="h-4 w-4 flex-shrink-0" aria-hidden />
              {row.label}
            </dt>
            <dd className="font-medium text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-slate-100 pt-4">
        <p className="mb-3 text-sm font-medium text-slate-900">Changer le mot de passe</p>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
