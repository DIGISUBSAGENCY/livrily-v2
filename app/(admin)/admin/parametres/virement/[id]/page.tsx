import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BankTransferForm } from '@/components/admin/BankTransferForm'
import { Card } from '@/components/ui/Card'
import { updateBankTransferInfo } from '@/app/(admin)/admin/parametres/virement/actions'
import { Heading } from '@/components/ui/Typography'

interface EditBankTransferPageProps {
  params: Promise<{ id: string }>
}

export default async function EditBankTransferPage({ params }: EditBankTransferPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: bankInfo, error } = await supabase.from('bank_transfer_info').select('*').eq('id', id).single()

  if (error || !bankInfo) {
    notFound()
  }

  const updateBankInfoWithId = updateBankTransferInfo.bind(null, bankInfo.id)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/admin/parametres/virement" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Coordonnées de virement
      </Link>
      <Heading level="h1" className="mt-3">Modifier {bankInfo.bank_name}</Heading>
      <Card className="mt-6">
        <BankTransferForm action={updateBankInfoWithId} bankInfo={bankInfo} submitLabel="Enregistrer" />
      </Card>
    </main>
  )
}
