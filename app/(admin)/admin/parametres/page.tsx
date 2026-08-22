import Link from 'next/link'
import { Percent, Landmark, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'

// Hub qui regroupe les réglages plateforme déjà existants (Commission,
// Virement, Libération automatique) sous un même point d'entrée — ne
// remplace ni ne restructure ces pages, se contente d'y renvoyer avec un
// aperçu chiffré. Tuile "Zones" retirée avec le rôle commerce
// (delivery_zones supprimée). Les clés OneSignal/Twilio/Flouci restent des
// variables d'environnement, pas des lignes admin-éditables — pas de
// "réglage notifications" à lister ici tant que ça reste le cas.
export default async function AdminParametresPage() {
  const supabase = await createClient()

  const [{ data: settings }, { count: bankCount }] = await Promise.all([
    supabase.from('platform_settings').select('travel_commission_rate, auto_release_delay_days').eq('id', true).single(),
    supabase.from('bank_transfer_info').select('id', { count: 'exact', head: true }),
  ])

  const commissionPercent = settings ? Math.round(settings.travel_commission_rate * 10000) / 100 : null

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paramètres</h1>
      <p className="mt-1 text-sm text-slate-500">Réglages globaux de la plateforme Livrily.</p>

      <div className="mt-6 space-y-4">
        <Link href="/admin/parametres/commission">
          <Card interactive className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Percent className="h-6 w-6 text-brand-600" aria-hidden />
              <div>
                <p className="font-medium text-slate-900">Commission</p>
                <p className="text-sm text-slate-500">Taux prélevé sur les livraisons Livrily entre particuliers</p>
              </div>
            </div>
            <p className="text-lg font-bold text-slate-900">
              {commissionPercent != null ? `${commissionPercent}%` : '—'}
            </p>
          </Card>
        </Link>

        <Link href="/admin/parametres/virement">
          <Card interactive className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Landmark className="h-6 w-6 text-brand-600" aria-hidden />
              <div>
                <p className="font-medium text-slate-900">Virement</p>
                <p className="text-sm text-slate-500">Coordonnées bancaires/Flouci affichées au paiement escrow Jibli</p>
              </div>
            </div>
            <p className="text-lg font-bold text-slate-900">{bankCount ?? 0}</p>
          </Card>
        </Link>

        <Link href="/admin/parametres/liberation-automatique">
          <Card interactive className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-brand-600" aria-hidden />
              <div>
                <p className="font-medium text-slate-900">Libération automatique</p>
                <p className="text-sm text-slate-500">
                  Délai avant libération des fonds si le client ne confirme jamais réception
                </p>
              </div>
            </div>
            <p className="text-lg font-bold text-slate-900">
              {settings ? `${settings.auto_release_delay_days} j` : '—'}
            </p>
          </Card>
        </Link>
      </div>
    </main>
  )
}
