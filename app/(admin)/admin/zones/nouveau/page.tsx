import Link from 'next/link'
import { ZoneForm } from '@/components/admin/ZoneForm'
import { Card } from '@/components/ui/Card'
import { createZone } from '@/app/(admin)/admin/zones/actions'

export default function NewZonePage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/zones" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Zones
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Nouvelle zone</h1>
      <Card className="mt-6">
        <ZoneForm action={createZone} submitLabel="Créer la zone" />
      </Card>
    </main>
  )
}
