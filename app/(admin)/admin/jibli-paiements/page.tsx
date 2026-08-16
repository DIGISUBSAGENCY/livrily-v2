import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { VerifyPaymentButton } from '@/components/travel/VerifyPaymentButton'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'

// Mini page admin dédiée à la validation des virements en attente pour le
// crowd-shipping (Flouci n'y apparaît jamais : confirmé automatiquement par
// l'API, cf. supabase/schema.sql accept_travel_proposal). Volontairement
// restreinte à ce seul besoin — le dashboard admin complet (Phase 4) n'est
// pas construit ici.
export default async function JibliPaiementsPage() {
  const supabase = await createClient()

  const { data: payments, error } = await supabase
    .from('travel_payments')
    .select('*')
    .eq('status', 'awaiting_verification')
    .order('created_at', { ascending: true })

  const requestIds = Array.from(new Set((payments ?? []).map((p) => p.request_id)))
  const { data: requests } = requestIds.length
    ? await supabase.from('travel_requests').select('id, item_description').in('id', requestIds)
    : { data: [] }
  const requestById = new Map((requests ?? []).map((r) => [r.id, r]))

  // Les preuves de virement vivent dans un bucket privé : on génère des URL
  // signées à durée limitée pour l'affichage, jamais d'URL publique directe.
  const signedUrls = new Map<string, string>()
  for (const payment of payments ?? []) {
    if (!payment.payment_proof_url) continue
    const { data } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(payment.payment_proof_url, 3600)
    if (data?.signedUrl) signedUrls.set(payment.id, data.signedUrl)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paiements Jibli en attente</h1>
      <p className="mt-1 text-sm text-slate-500">
        Virements pour le crowd-shipping en attente de vérification manuelle.
      </p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les paiements.</p>}

      {!error && payments && payments.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun paiement en attente de vérification.</p>
        </div>
      )}

      {!error && payments && payments.length > 0 && (
        <div className="mt-6 space-y-4">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {requestById.get(payment.request_id)?.item_description ?? 'Demande'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(payment.created_at).toLocaleString('fr-TN')}
                  </p>
                </div>
                <Badge tone="info">Virement</Badge>
              </div>

              <div className="mt-3 flex gap-6 text-sm">
                <div>
                  <p className="text-slate-500">Montant total</p>
                  <p className="font-medium text-slate-900">{formatTND(payment.amount)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Commission</p>
                  <p className="font-medium text-slate-900">{formatTND(payment.commission_amount)}</p>
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
                <VerifyPaymentButton paymentId={payment.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
