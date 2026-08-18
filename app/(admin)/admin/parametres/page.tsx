import Link from 'next/link'
import { Percent, Landmark, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'

// Hub qui regroupe les réglages plateforme déjà existants (Commission,
// Virement, Zones) sous un même point d'entrée — ne remplace ni ne
// restructure ces pages, se contente d'y renvoyer avec un aperçu chiffré.
// Aucun autre paramètre configurable en base n'a été trouvé dans le code
// (les clés OneSignal/Twilio/Flouci sont des variables d'environnement,
// pas des lignes admin-éditables — pas de "réglage notifications" à lister
// ici tant que ça reste le cas).
export default async function AdminParametresPage() {
  const supabase = await createClient()

  const [{ data: settings }, { count: bankCount }, { count: zonesCount }] = await Promise.all([
    supabase.from('platform_settings').select('travel_commission_rate').eq('id', true).single(),
    supabase.from('bank_transfer_info').select('id', { count: 'exact', head: true }),
    supabase.from('delivery_zones').select('id', { count: 'exact', head: true }),
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
                <p className="text-sm text-slate-500">Coordonnées bancaires/Flouci affichées au checkout</p>
              </div>
            </div>
            <p className="text-lg font-bold text-slate-900">{bankCount ?? 0}</p>
          </Card>
        </Link>

        <Link href="/admin/zones">
          <Card interactive className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="h-6 w-6 text-brand-600" aria-hidden />
              <div>
                <p className="font-medium text-slate-900">Zones de livraison</p>
                <p className="text-sm text-slate-500">Zones, frais de livraison et règles de surge tarifaire</p>
              </div>
            </div>
            <p className="text-lg font-bold text-slate-900">{zonesCount ?? 0}</p>
          </Card>
        </Link>
      </div>
    </main>
  )
}
