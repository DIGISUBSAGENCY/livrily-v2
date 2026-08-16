import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProductForm } from '@/components/commerce-dashboard/ProductForm'
import { Card } from '@/components/ui/Card'
import { updateProduct } from '@/app/(admin)/admin/commerces/[id]/produits/actions'

interface EditAdminProductPageProps {
  params: Promise<{ id: string; productId: string }>
}

export default async function EditAdminProductPage({ params }: EditAdminProductPageProps) {
  const { id, productId } = await params
  const supabase = await createClient()

  const [{ data: commerce }, { data: product, error }] = await Promise.all([
    supabase.from('commerces').select('id, name').eq('id', id).single(),
    supabase.from('products').select('*').eq('id', productId).eq('commerce_id', id).single(),
  ])

  if (error || !product || !commerce) {
    notFound()
  }

  const updateProductForCommerce = updateProduct.bind(null, id, productId)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href={`/admin/commerces/${id}/produits`} className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Produits — {commerce.name}
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Modifier {product.name}</h1>
      <Card className="mt-6">
        <ProductForm action={updateProductForCommerce} product={product} submitLabel="Enregistrer" />
      </Card>
    </main>
  )
}
