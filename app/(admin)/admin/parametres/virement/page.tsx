import Link from 'next/link'
import { Plus, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BankTransferRow } from '@/components/admin/BankTransferRow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Heading } from '@/components/ui/Typography'

export default async function AdminBankTransferPage() {
  const supabase = await createClient()
  const { data: entries, error } = await supabase
    .from('bank_transfer_info')
    .select('*')
    .order('updated_at', { ascending: false })

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Heading level="h1">Coordonnées de virement</Heading>
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
        <EmptyState icon={Landmark}>
          <p>Aucune coordonnée bancaire configurée.</p>
        </EmptyState>
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
