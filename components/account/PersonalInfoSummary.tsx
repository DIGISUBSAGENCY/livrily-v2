import Link from 'next/link'
import { UserCircle2, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface PersonalInfoSummaryProps {
  fullName: string | null
  countryLabel: string
  address: string | null
  profession: string | null
}

// Champs réels du schéma uniquement (profiles.full_name/country/address/
// profession) — pas de date de naissance/nationalité/ville/code postal
// séparé : ces colonnes n'existent pas en base (décision explicite : ne
// pas inventer de faux champs, cf. discussion). Prénom/Nom non séparés non
// plus, full_name est un champ unique partout ailleurs dans l'app.
export function PersonalInfoSummary({ fullName, countryLabel, address, profession }: PersonalInfoSummaryProps) {
  const fields = [
    { label: 'Nom complet', value: fullName || 'Non renseigné' },
    { label: 'Pays', value: countryLabel },
    { label: 'Adresse', value: address || 'Non renseignée' },
    { label: 'Profession', value: profession || 'Non renseignée' },
  ]

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <UserCircle2 className="h-5 w-5 text-brand-600" aria-hidden />
          Informations personnelles
        </h2>
        <Link href="/profil/completer">
          <Button variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Modifier
          </Button>
        </Link>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{field.label}</dt>
            <dd className="mt-0.5 text-sm text-slate-900">{field.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
