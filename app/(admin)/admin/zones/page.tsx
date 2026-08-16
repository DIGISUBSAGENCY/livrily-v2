import Link from 'next/link'
import { Plus, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ZoneRow } from '@/components/admin/ZoneRow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default async function AdminZonesPage() {
  const supabase = await createClient()
  const { data: zones, error } = await supabase.from('delivery_zones').select('*').order('name')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Zones de livraison</h1>
        <Link href="/admin/zones/nouveau">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Ajouter
          </Button>
        </Link>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger les zones.</p>}

      {!error && zones && zones.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <MapPin className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune zone pour l&apos;instant.</p>
        </div>
      )}

      {!error && zones && zones.length > 0 && (
        <Card className="mt-6">
          {zones.map((zone) => (
            <ZoneRow key={zone.id} zone={zone} />
          ))}
        </Card>
      )}
    </main>
  )
}
