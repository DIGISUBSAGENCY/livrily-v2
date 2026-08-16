import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ProductCard } from '@/components/commerce/ProductCard'
import { CartBar } from '@/components/cart/CartBar'
import { ReliabilityBadge } from '@/components/commerce/ReliabilityBadge'
import { RatingsList } from '@/components/commerce/RatingsList'
import { Badge } from '@/components/ui/Badge'
import { pageMetadata } from '@/lib/seo'
import { Store } from 'lucide-react'

const categoryLabels: Record<string, string> = {
  supermarche: 'Supermarché',
  boulangerie: 'Boulangerie',
  fruits_legumes: 'Fruits & légumes',
  pharmacie: 'Pharmacie',
}

interface CommercePageProps {
  params: Promise<{ id: string }>
}

// cache() : dédoublonne la requête entre generateMetadata et le composant
// de page, tous deux appelés pour le même rendu (recommandation Next.js).
const getCommerce = cache(async (id: string) => {
  const supabase = await createClient()
  const { data } = await supabase.from('commerces').select('*').eq('id', id).eq('is_active', true).single()
  return data
})

export async function generateMetadata({ params }: CommercePageProps): Promise<Metadata> {
  const { id } = await params
  const commerce = await getCommerce(id)

  if (!commerce) {
    return pageMetadata({ title: 'Commerce introuvable', description: 'Ce commerce est introuvable ou inactif.' })
  }

  const category = categoryLabels[commerce.category] ?? commerce.category
  return pageMetadata({
    title: commerce.name,
    description:
      commerce.description ??
      `${category}${commerce.address ? ` à ${commerce.address}` : ''} — commande sur Livrily, livré chez toi.`,
  })
}

export default async function CommerceDetailPage({ params }: CommercePageProps) {
  const { id } = await params
  const supabase = await createClient()
  const commerce = await getCommerce(id)

  if (!commerce) {
    notFound()
  }

  const [{ data: products, error: productsError }, { data: ratings }] = await Promise.all([
    supabase.from('products').select('*').eq('commerce_id', id).eq('is_available', true).order('name'),
    supabase
      .from('ratings')
      .select('score, comment, created_at')
      .eq('commerce_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
          {commerce.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={commerce.logo_url} alt={commerce.name} className="h-full w-full rounded-lg object-cover" />
          ) : (
            <Store className="h-7 w-7 text-slate-400" aria-hidden />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{commerce.name}</h1>
          <Badge tone="info" className="mt-1">
            {categoryLabels[commerce.category] ?? commerce.category}
          </Badge>
          {commerce.address && <p className="mt-2 text-sm text-slate-500">{commerce.address}</p>}
          {commerce.description && <p className="mt-1 text-sm text-slate-600">{commerce.description}</p>}
          <ReliabilityBadge
            avgDeliveryTimeMinutes={commerce.avg_delivery_time_minutes}
            onTimeRate={commerce.on_time_rate}
            ratingsAvg={commerce.ratings_avg}
            ratingsCount={commerce.ratings_count}
            className="mt-2"
          />
        </div>
      </div>

      {!commerce.is_open && (
        <Badge tone="neutral" className="mt-4">
          Ce commerce est actuellement fermé — commande indisponible pour le moment.
        </Badge>
      )}

      {productsError && (
        <p className="mt-8 text-sm text-red-600">Impossible de charger le catalogue. Réessaie dans un instant.</p>
      )}

      {!productsError && products && products.length === 0 && (
        <p className="mt-12 text-center text-slate-500">Ce commerce n&apos;a pas encore de produits disponibles.</p>
      )}

      {!productsError && products && products.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              commerceId={commerce.id}
              commerceName={commerce.name}
              disabled={!commerce.is_open}
            />
          ))}
        </div>
      )}

      <RatingsList ratings={ratings ?? []} />

      {commerce.is_open && <CartBar commerceId={commerce.id} />}
    </main>
  )
}
