import Link from 'next/link'
import { Plus, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BankTransferRow } from '@/components/admin/BankTransferRow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default async function AdminBankTransferPage() {
  const supabase = await createClient()
  const { data: entries, error } = await supabase
    .from('bank_transfer_info')
    .select('*')
    .order('updated_at', { ascending: false })

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Coordonnées de virement</h1>
        <Link href="/admin/parametres/virement/nouveau">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Ajouter
          </Button>
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Affichées aux clients au checkout (virement) et pour l&apos;escrow crowd-shipping (RIB + Flouci).
      </p>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger les coordonnées.</p>}

      {!error && entries && entries.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Landmark className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune coordonnée bancaire configurée.</p>
        </div>
      )}

      {!error && entries && entries.length > 0 && (
        <Card className="mt-6">
          {entries.map((entry) => (
            <BankTransferRow key={entry.id} bankInfo={entry} />
          ))}
        </Card>
      )}
    </main>
  )
}
