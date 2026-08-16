import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ZoneForm } from '@/components/admin/ZoneForm'
import { SurgeRuleForm } from '@/components/admin/SurgeRuleForm'
import { SurgeRuleRow } from '@/components/admin/SurgeRuleRow'
import { Card } from '@/components/ui/Card'
import { updateZone } from '@/app/(admin)/admin/zones/actions'

interface EditZonePageProps {
  params: Promise<{ id: string }>
}

export default async function EditZonePage({ params }: EditZonePageProps) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: zone, error }, { data: surgeRules }] = await Promise.all([
    supabase.from('delivery_zones').select('*').eq('id', id).single(),
    supabase.from('zone_surge_rules').select('*').eq('zone_id', id).order('start_time'),
  ])

  if (error || !zone) {
    notFound()
  }

  const updateZoneWithId = updateZone.bind(null, zone.id)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/zones" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Zones
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Modifier {zone.name}</h1>
      <Card className="mt-6">
        <ZoneForm action={updateZoneWithId} zone={zone} submitLabel="Enregistrer" />
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold text-slate-900">Majorations heure de pointe</h2>
        <p className="mt-1 text-sm text-slate-500">
          Multiplie le tarif calculé (base + distance) pendant les créneaux définis. Si plusieurs
          règles actives se chevauchent, seule la plus forte s&apos;applique.
        </p>

        {surgeRules && surgeRules.length > 0 && (
          <div className="mt-4">
            {surgeRules.map((rule) => (
              <SurgeRuleRow key={rule.id} rule={rule} />
            ))}
          </div>
        )}

        <div className="mt-4">
          <SurgeRuleForm zoneId={zone.id} />
        </div>
      </Card>
    </main>
  )
}
