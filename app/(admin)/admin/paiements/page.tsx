import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { OrderPaymentActions } from '@/components/orders/OrderPaymentActions'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'

// File d'attente des virements de commandes (commerces) en attente de
// vérification manuelle. Même principe que /admin/jibli-paiements, mais
// pour orders plutôt que travel_payments.
export default async function AdminPaiementsPage() {
  const supabase = await createClient()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('payment_method', 'virement')
    .eq('payment_status', 'awaiting_verification')
    .order('created_at', { ascending: true })

  const commerceIds = Array.from(new Set((orders ?? []).map((o) => o.commerce_id)))
  const clientIds = Array.from(new Set((orders ?? []).map((o) => o.client_id)))

  const [{ data: commerces }, { data: clients }] = await Promise.all([
    commerceIds.length
      ? supabase.from('commerces').select('id, name').in('id', commerceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    clientIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])
  const commerceById = new Map((commerces ?? []).map((c) => [c.id, c.name]))
  const clientById = new Map((clients ?? []).map((c) => [c.id, c.full_name ?? 'Client']))

  // Preuves dans un bucket privé : URL signées à durée limitée pour l'affichage.
  const signedUrls = new Map<string, string>()
  for (const order of orders ?? []) {
    if (!order.payment_proof_url) continue
    const { data } = await supabase.storage.from('payment-proofs').createSignedUrl(order.payment_proof_url, 3600)
    if (data?.signedUrl) signedUrls.set(order.id, data.signedUrl)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Paiements commandes en attente</h1>
      <p className="mt-1 text-sm text-slate-500">Virements pour des commandes commerces.</p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les paiements.</p>}

      {!error && orders && orders.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucun paiement en attente de vérification.</p>
        </div>
      )}

      {!error && orders && orders.length > 0 && (
        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{commerceById.get(order.commerce_id) ?? 'Commerce'}</p>
                  <p className="text-xs text-slate-500">
                    {clientById.get(order.client_id) ?? 'Client'} ·{' '}
                    {new Date(order.created_at).toLocaleString('fr-TN')}
                  </p>
                </div>
                <p className="font-semibold text-slate-900">{formatTND(order.total)}</p>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                <span className="text-slate-500">Adresse : </span>
                {order.delivery_address}
              </p>

              {signedUrls.has(order.id) && (
                // eslint-disable-next-line @next/next/no-img-element -- preuve utilisateur via URL signée temporaire
                <img
                  src={signedUrls.get(order.id)}
                  alt="Preuve de virement"
                  className="mt-3 max-h-64 rounded-lg border border-slate-200 object-contain"
                />
              )}

              <div className="mt-4">
                <OrderPaymentActions orderId={order.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  )
}
