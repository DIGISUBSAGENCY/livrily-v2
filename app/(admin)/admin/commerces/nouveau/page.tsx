import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CommerceForm } from '@/components/admin/CommerceForm'
import { Card } from '@/components/ui/Card'
import { createCommerce } from '@/app/(admin)/admin/commerces/actions'

export default async function NewCommercePage() {
  const supabase = await createClient()
  const { data: zones } = await supabase.from('delivery_zones').select('*').eq('is_active', true).order('name')

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/commerces" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Commerces
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Nouveau commerce</h1>
      <Card className="mt-6">
        <CommerceForm action={createCommerce} zones={zones ?? []} submitLabel="Créer le commerce" />
      </Card>
    </main>
  )
}
