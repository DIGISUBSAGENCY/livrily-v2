import type { Metadata } from 'next'
import { Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CommerceCard } from '@/components/commerce/CommerceCard'
import { CommerceFilters } from '@/components/commerce/CommerceFilters'
import { pageMetadata } from '@/lib/seo'
import type { CommerceCategory } from '@/types/database'

export const metadata: Metadata = pageMetadata({
  title: 'Commerces partenaires',
  description:
    'Supermarchés, boulangeries, fruits & légumes et pharmacies près de chez toi en Tunisie, livrés à domicile via Livrily.',
})

const validCategories: CommerceCategory[] = ['supermarche', 'boulangerie', 'fruits_legumes', 'pharmacie']

interface CommercesPageProps {
  searchParams: Promise<{ category?: string; q?: string }>
}

export default async function CommercesPage({ searchParams }: CommercesPageProps) {
  const { category, q } = await searchParams
  const supabase = await createClient()

  let query = supabase.from('commerces').select('*').eq('is_active', true).order('name')

  if (category && validCategories.includes(category as CommerceCategory)) {
    query = query.eq('category', category as CommerceCategory)
  }
  if (q) {
    query = query.ilike('name', `%${q}%`)
  }

  const { data: commerces, error } = await query

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Commerces partenaires</h1>
      <div className="mt-6">
        <CommerceFilters defaultQuery={q ?? ''} />
      </div>

      {error && (
        <p className="mt-8 text-sm text-red-600">
          Impossible de charger les commerces pour le moment. Réessaie dans un instant.
        </p>
      )}

      {!error && commerces && commerces.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <Store className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun commerce ne correspond à ta recherche.</p>
        </div>
      )}

      {!error && commerces && commerces.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {commerces.map((commerce) => (
            <CommerceCard key={commerce.id} commerce={commerce} />
          ))}
        </div>
      )}
    </main>
  )
}
