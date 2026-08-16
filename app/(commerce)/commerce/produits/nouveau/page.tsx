import Link from 'next/link'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { ProductForm } from '@/components/commerce-dashboard/ProductForm'
import { Card } from '@/components/ui/Card'
import { createProduct } from '@/app/(commerce)/commerce/produits/actions'

export default async function NewProductPage() {
  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Link href="/commerce/produits" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Catalogue
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Ajouter un produit</h1>
      <Card className="mt-6">
        <ProductForm
          action={createProduct}
          submitLabel="Créer le produit"
          showPrescriptionField={commerce.category === 'pharmacie'}
        />
      </Card>
    </main>
  )
}
