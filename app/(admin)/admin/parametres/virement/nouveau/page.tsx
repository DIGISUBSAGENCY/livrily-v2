import Link from 'next/link'
import { BankTransferForm } from '@/components/admin/BankTransferForm'
import { Card } from '@/components/ui/Card'
import { createBankTransferInfo } from '@/app/(admin)/admin/parametres/virement/actions'

export default function NewBankTransferPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/parametres/virement" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Coordonnées de virement
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Nouvelles coordonnées</h1>
      <Card className="mt-6">
        <BankTransferForm action={createBankTransferInfo} submitLabel="Créer" />
      </Card>
    </main>
  )
}
