import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plane, Wallet, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

// Dashboard retreint aux métriques Jibli (crowd-shipping) — les métriques
// commerce (commandes du jour, CA, temps de livraison moyen, commerces
// actifs) ont disparu avec le rôle commerce, cf. suppression complète.
export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ count: travelAwaiting }, { count: travelOpen }, { count: withdrawalsAwaiting }, { count: verificationsAwaiting }] =
    await Promise.all([
      supabase.from('travel_payments').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_verification'),
      supabase.from('travel_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('identity_verifications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

  const paymentsPending = (travelAwaiting ?? 0) + (withdrawalsAwaiting ?? 0)

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tableau de bord</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <Plane className="h-6 w-6 text-brand-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{travelOpen ?? 0}</p>
            <p className="text-sm text-slate-500">Demandes Jibli ouvertes</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-amber-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{paymentsPending}</p>
            <p className="text-sm text-slate-500">Paiements en attente (total)</p>
          </div>
        </Card>

        <Card className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-slate-600" aria-hidden />
          <div>
            <p className="text-2xl font-bold tracking-tight text-slate-900">{verificationsAwaiting ?? 0}</p>
            <p className="text-sm text-slate-500">Vérifications KYC en attente</p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/jibli-paiements">
          <Card interactive className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Paiements Jibli</p>
              <p className="text-sm text-slate-500">
                Virements escrow en attente · {travelOpen ?? 0} demande{(travelOpen ?? 0) > 1 ? 's' : ''} ouverte
                {(travelOpen ?? 0) > 1 ? 's' : ''}
              </p>
            </div>
            {(travelAwaiting ?? 0) > 0 && <Badge tone="warning">{travelAwaiting}</Badge>}
          </Card>
        </Link>

        <Link href="/admin/retraits">
          <Card interactive className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Retraits voyageurs</p>
              <p className="text-sm text-slate-500">Demandes de retrait en attente de traitement</p>
            </div>
            {(withdrawalsAwaiting ?? 0) > 0 && <Badge tone="warning">{withdrawalsAwaiting}</Badge>}
          </Card>
        </Link>

        <Link href="/admin/verifications">
          <Card interactive className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden />
              <div>
                <p className="font-medium text-slate-900">Vérifications d&apos;identité</p>
                <p className="text-sm text-slate-500">Soumissions KYC en attente d&apos;examen</p>
              </div>
            </div>
            {(verificationsAwaiting ?? 0) > 0 && <Badge tone="warning">{verificationsAwaiting}</Badge>}
          </Card>
        </Link>
      </div>
    </main>
  )
}
