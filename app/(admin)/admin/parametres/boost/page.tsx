import { Rocket } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BoostTierRow } from '@/components/admin/BoostTierRow'
import { Card } from '@/components/ui/Card'
import { Heading } from '@/components/ui/Typography'

// Même pattern que /admin/parametres/commission (page.tsx lecture Server
// Component + actions.ts Server Action + composant client par formulaire) —
// copié/adapté, pas réinventé. Différence structurelle : 7 lignes
// éditables (paliers 1-7 jours) au lieu d'un champ unique, donc 7
// formulaires indépendants (BoostTierRow) plutôt qu'un seul.
export default async function AdminBoostPricingPage() {
  const supabase = await createClient()

  const { data: tiers, error } = await supabase
    .from('boost_pricing_tiers')
    .select('duration_days, price_tnd, updated_at')
    .order('duration_days')

  const lastUpdatedAt = tiers?.reduce<string | null>((latest, tier) => {
    if (!tier.updated_at) return latest
    if (!latest || tier.updated_at > latest) return tier.updated_at
    return latest
  }, null)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Heading level="h1" className="flex items-center gap-2">
        <Rocket className="h-6 w-6 text-brand-600" aria-hidden />
        Tarification Boost
      </Heading>
      <p className="mt-1 text-sm text-slate-500">
        Prix par palier de durée (1 à 7 jours) pour la mise en avant d&apos;un trajet, d&apos;une offre ou
        d&apos;une demande dans les listings.
      </p>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger la grille de tarification.</p>}

      {tiers && tiers.length > 0 && (
        <Card className="mt-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <span>Durée</span>
            <span className="mr-24">Prix (TND)</span>
          </div>
          {tiers.map((tier) => (
            <BoostTierRow key={tier.duration_days} durationDays={tier.duration_days} defaultPrice={tier.price_tnd} />
          ))}
          {lastUpdatedAt && (
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
              Dernière mise à jour : {new Date(lastUpdatedAt).toLocaleString('fr-TN')}
            </p>
          )}
        </Card>
      )}
    </main>
  )
}
