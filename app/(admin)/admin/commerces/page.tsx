import Link from 'next/link'
import { Plus, Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CommerceRow } from '@/components/admin/CommerceRow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default async function AdminCommercesPage() {
  const supabase = await createClient()
  const { data: commerces, error } = await supabase.from('commerces').select('*').order('name')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Commerces</h1>
        <Link href="/admin/commerces/nouveau">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Ajouter
          </Button>
        </Link>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger les commerces.</p>}

      {!error && commerces && commerces.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Store className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun commerce pour l&apos;instant.</p>
        </div>
      )}

      {!error && commerces && commerces.length > 0 && (
        <Card className="mt-6">
          {commerces.map((commerce) => (
            <CommerceRow key={commerce.id} commerce={commerce} />
          ))}
        </Card>
      )}
    </main>
  )
}
