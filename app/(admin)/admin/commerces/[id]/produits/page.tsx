import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductRow } from '@/components/commerce-dashboard/ProductRow'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { deleteProduct, toggleProductAvailability } from '@/app/(admin)/admin/commerces/[id]/produits/actions'

interface AdminProductsPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminCommerceProductsPage({ params }: AdminProductsPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: commerce, error: commerceError } = await supabase
    .from('commerces')
    .select('id, name')
    .eq('id', id)
    .single()

  if (commerceError || !commerce) {
    notFound()
  }

  const { data: products, error } = await supabase.from('products').select('*').eq('commerce_id', id).order('name')

  const onDelete = deleteProduct.bind(null, id)
  const onToggle = toggleProductAvailability.bind(null, id)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/admin/commerces" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Commerces
      </Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Produits — {commerce.name}</h1>
        <Link href={`/admin/commerces/${id}/produits/nouveau`}>
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
            <ProductRow
              key={product.id}
              product={product}
              onDelete={onDelete}
              onToggle={onToggle}
              editHref={`/admin/commerces/${id}/produits/${product.id}`}
            />
          ))}
        </Card>
      )}
    </main>
  )
}
