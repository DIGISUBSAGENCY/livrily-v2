import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/commerce-dashboard/ProductForm'
import { Card } from '@/components/ui/Card'
import { createProduct } from '@/app/(admin)/admin/commerces/[id]/produits/actions'

interface NewAdminProductPageProps {
  params: Promise<{ id: string }>
}

export default async function NewAdminProductPage({ params }: NewAdminProductPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: commerce, error } = await supabase.from('commerces').select('id, name').eq('id', id).single()

  if (error || !commerce) {
    notFound()
  }

  const createProductForCommerce = createProduct.bind(null, id)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href={`/admin/commerces/${id}/produits`} className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Produits — {commerce.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Ajouter un produit</h1>
      <Card className="mt-6">
        <ProductForm action={createProductForCommerce} submitLabel="Créer le produit" />
      </Card>
    </main>
  )
}
