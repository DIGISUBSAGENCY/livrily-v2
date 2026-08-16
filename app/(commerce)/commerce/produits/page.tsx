import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { ProductRow } from '@/components/commerce-dashboard/ProductRow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export default async function CommerceProductsPage() {
  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  const supabase = await createClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('commerce_id', commerce.id)
    .order('name')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mon catalogue</h1>
        <Link href="/commerce/produits/nouveau">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Ajouter
          </Button>
        </Link>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger le catalogue.</p>}

      {!error && products && products.length === 0 && (
        <p className="mt-12 text-center text-slate-500">Aucun produit pour l&apos;instant.</p>
      )}

      {!error && products && products.length > 0 && (
        <Card className="mt-6">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </Card>
      )}
    </main>
  )
}
