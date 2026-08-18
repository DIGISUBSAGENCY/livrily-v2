import { Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CommissionForm } from '@/components/admin/CommissionForm'
import { Card } from '@/components/ui/Card'

// Configuration du taux de commission Livrily sur les opérations de
// livraison entre particuliers (nommées "Jibli" en interne uniquement —
// tables/colonnes techniques inchangées, seul le wording affiché ici est
// "Livrily"). Remplace le taux auparavant câblé en dur à 0% dans
// accept_travel_proposal() (schema.sql) par platform_settings, une ligne
// unique éditable ici.
export default async function AdminCommissionPage() {
  const supabase = await createClient()

  const { data: settings, error } = await supabase
    .from('platform_settings')
    .select('travel_commission_rate, updated_at')
    .eq('id', true)
    .single()

  // Fraction (0.10) → pourcentage humain (10) pour l'input. 0.10 par défaut
  // si la ligne singleton manquait pour une raison quelconque (ne devrait
  // pas arriver, seedée dans schema.sql).
  const defaultRatePercent = settings ? Math.round(settings.travel_commission_rate * 10000) / 100 : 10

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Percent className="h-6 w-6 text-brand-600" aria-hidden />
        Commission Livrily
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Taux prélevé par la plateforme sur chaque livraison Livrily entre particuliers.
      </p>

      {error && (
        <p className="mt-6 text-sm text-red-600">Impossible de charger le taux de commission actuel.</p>
      )}

      <Card className="mt-6">
        <CommissionForm defaultRatePercent={defaultRatePercent} />
        {settings?.updated_at && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            Dernière mise à jour : {new Date(settings.updated_at).toLocaleString('fr-TN')}
          </p>
        )}
      </Card>
    </main>
  )
}
