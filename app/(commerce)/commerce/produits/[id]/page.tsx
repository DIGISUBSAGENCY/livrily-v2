import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { ProductForm } from '@/components/commerce-dashboard/ProductForm'
import { Card } from '@/components/ui/Card'
import { updateProduct } from '@/app/(commerce)/commerce/produits/actions'

interface EditProductPageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params
  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  const supabase = await createClient()
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .eq('commerce_id', commerce.id)
    .single()

  if (error || !product) {
    notFound()
  }

  const updateProductWithId = updateProduct.bind(null, product.id)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/commerce/produits" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Catalogue
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Modifier {product.name}</h1>
      <Card className="mt-6">
        <ProductForm
          action={updateProductWithId}
          product={product}
          submitLabel="Enregistrer"
          showPrescriptionField={commerce.category === 'pharmacie'}
        />
      </Card>
    </main>
  )
}
