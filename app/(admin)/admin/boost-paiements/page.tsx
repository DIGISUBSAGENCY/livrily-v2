import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BoostPaymentActions } from '@/components/admin/BoostPaymentActions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'

// Mini page admin dédiée, mirror de /admin/jibli-paiements — liste simple,
// pas un dashboard (cf. plan validé). boosted_until est déjà posé depuis
// l'achat (virement = activation immédiate) : valider ici est un
// rapprochement comptable a posteriori, jamais un gate d'activation — cf.
// actions.ts.
export default async function BoostPaiementsPage() {
  const supabase = await createClient()

  const { data: payments, error } = await supabase
    .from('boost_payments')
    .select('*')
    .eq('status', 'awaiting_verification')
    .order('created_at', { ascending: true })

  const tripIds = Array.from(new Set((payments ?? []).map((p) => p.trip_id).filter((id): id is string => id !== null)))
  const offerIds = Array.from(
    new Set((payments ?? []).map((p) => p.product_offer_id).filter((id): id is string => id !== null))
  )
  const voyageurIds = Array.from(new Set((payments ?? []).map((p) => p.voyageur_id)))

  const [{ data: trips }, { data: offers }, { data: voyageurs }] = await Promise.all([
    tripIds.length
      ? supabase.from('trips').select('id, origin_country, destination_city').in('id', tripIds)
      : Promise.resolve({ data: [] }),
    offerIds.length
      ? supabase.from('product_offers').select('id, item_description').in('id', offerIds)
      : Promise.resolve({ data: [] }),
    voyageurIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', voyageurIds)
      : Promise.resolve({ data: [] }),
  ])
  const tripById = new Map((trips ?? []).map((t) => [t.id, t]))
  const offerById = new Map((offers ?? []).map((o) => [o.id, o]))
  const voyageurById = new Map((voyageurs ?? []).map((v) => [v.id, v]))

  // Preuves de virement dans un bucket privé : URL signées à durée limitée,
  // même précaution que /admin/jibli-paiements.
  const signedUrls = new Map<string, string>()
  for (const payment of payments ?? []) {
    if (!payment.payment_proof_url) continue
    const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(payment.payment_proof_url, 3600)
    if (data?.signedUrl) signedUrls.set(payment.id, data.signedUrl)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paiements Boost en attente</h1>
      <p className="mt-1 text-sm text-slate-500">
        Virements pour la mise en avant payante (trips/offres) en attente de vérification manuelle.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les paiements.</p>}

      {!error && payments && payments.length === 0 && (
        <EmptyState icon={Sparkles}>
          <p>Aucun paiement en attente de vérification.</p>
        </EmptyState>
      )}

      {!error && payments && payments.length > 0 && (
        <div className="mt-6 space-y-4">
          {payments.map((payment) => {
            const trip = payment.trip_id ? tripById.get(payment.trip_id) : null
            const offer = payment.product_offer_id ? offerById.get(payment.product_offer_id) : null
            const label = trip
              ? `Trip : ${trip.origin_country} → ${trip.destination_city}`
              : offer
                ? `Offre : ${offer.item_description}`
                : 'Item introuvable'
            const voyageurName = voyageurById.get(payment.voyageur_id)?.full_name ?? 'Voyageur'

            return (
              <Card key={payment.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500">
                      {voyageurName} · {new Date(payment.created_at).toLocaleString('fr-TN')}
                    </p>
                  </div>
                  <Badge tone="info">Virement</Badge>
                </div>

                <div className="mt-3 flex gap-6 text-sm">
                  <div>
                    <p className="text-slate-500">Montant</p>
                    <p className="font-medium text-slate-900">{formatTND(payment.amount)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Durée</p>
                    <p className="font-medium text-slate-900">
                      {payment.duration_days} jour{payment.duration_days > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {signedUrls.has(payment.id) && (
                  // eslint-disable-next-line @next/next/no-img-element -- preuve utilisateur via URL signée temporaire
                  <img
                    src={signedUrls.get(payment.id)}
                    alt="Preuve de virement"
                    className="mt-3 max-h-64 rounded-lg border border-slate-200 object-contain"
                  />
                )}

                <div className="mt-4">
                  <BoostPaymentActions paymentId={payment.id} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
