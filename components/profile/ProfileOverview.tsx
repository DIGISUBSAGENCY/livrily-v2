import Link from 'next/link'
import { Plane, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

// Contenu volontairement minimal pour cette étape — stats (demandes
// publiées, livraisons réalisées, fiabilité…) et gamification arrivent dans
// une étape suivante, une fois qu'on aura défini ce qui vaut la peine
// d'être affiché. Pour l'instant, deux raccourcis vers les actions les plus
// courantes plutôt qu'un tab vide.
export function ProfileOverview() {
  return (
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
  )
}
