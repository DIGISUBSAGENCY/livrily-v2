import { Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AutoReleaseForm } from '@/components/admin/AutoReleaseForm'
import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { Heading } from '@/components/ui/Typography'

// Configuration du délai de libération automatique des fonds séquestrés
// quand le client ne confirme jamais réception (ni ne conteste) —
// jusqu'ici le voyageur restait bloqué indéfiniment, sans recours.
// Réutilise platform_settings (même ligne singleton que la commission),
// appliqué par auto_release_stale_payments() (schema.sql), exécutée une
// fois par jour par pg_cron.
export default async function AdminLiberationAutomatiquePage() {
  const supabase = await createClient()

  const { data: settings, error } = await supabase
    .from('platform_settings')
    .select('auto_release_delay_days, updated_at')
    .eq('id', true)
    .single()

  const defaultDelayDays = settings?.auto_release_delay_days ?? 7

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Heading level="h1" className="flex items-center gap-2">
        <Clock className="h-6 w-6 text-brand-600" aria-hidden />
        Libération automatique des fonds
      </Heading>
      <p className="mt-1 text-sm text-slate-500">
        Délai après lequel un paiement séquestré est libéré au voyageur si le client reste
        silencieux.
      </p>

      <Alert tone="info" className="mt-4">
        Ne se déclenche jamais tant qu&apos;un litige est ouvert sur la mission, quel que soit le
        délai écoulé — vérifié à chaque exécution, pas seulement à la création du litige.
      </Alert>

      {error && (
        <p className="mt-6 text-sm text-red-600">Impossible de charger le délai actuel.</p>
      )}

      <Card className="mt-6">
        <AutoReleaseForm defaultDelayDays={defaultDelayDays} />
        {settings?.updated_at && (
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
            Dernière mise à jour : {new Date(settings.updated_at).toLocaleString('fr-TN')}
          </p>
        )}
      </Card>
    </main>
  )
}
