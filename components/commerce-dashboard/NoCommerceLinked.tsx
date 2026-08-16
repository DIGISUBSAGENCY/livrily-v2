import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// Affiché quand un compte role='commerce' n'a pas encore de fiche commerce
// associée (commerces.owner_id) — l'admin doit compléter le lien (Phase 4).
export function NoCommerceLinked() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" aria-hidden />
      <h1 className="font-semibold text-slate-900">Compte non configuré</h1>
      <p className="mt-2 text-sm text-slate-600">
        Ton compte n&apos;est pas encore relié à une fiche commerce. Contacte l&apos;administrateur
        Livrily pour finaliser la configuration.
      </p>
    </Card>
  )
}
