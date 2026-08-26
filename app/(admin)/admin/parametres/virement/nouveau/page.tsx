import Link from 'next/link'
import { BankTransferForm } from '@/components/admin/BankTransferForm'
import { Card } from '@/components/ui/Card'
import { createBankTransferInfo } from '@/app/(admin)/admin/parametres/virement/actions'
import { Heading } from '@/components/ui/Typography'

export default function NewBankTransferPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/parametres/virement" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Coordonnées de virement
      </Link>
      <Heading level="h1" className="mt-3">Nouvelles coordonnées</Heading>
      <Card className="mt-6">
        <BankTransferForm action={createBankTransferInfo} submitLabel="Créer" />
      </Card>
    </main>
  )
}
