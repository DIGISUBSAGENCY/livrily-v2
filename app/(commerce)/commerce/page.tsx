import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardList, Package, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { OpenToggle } from '@/components/commerce-dashboard/OpenToggle'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export default async function CommerceDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  const { count: pendingCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('commerce_id', commerce.id)
    .eq('status', 'pending')

  const { count: activeCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('commerce_id', commerce.id)
    .in('status', ['accepted', 'ready', 'delivering'])

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{commerce.name}</h1>
        <div className="flex items-center gap-2">
          {!commerce.is_active && <Badge tone="warning">Compte désactivé par l&apos;admin</Badge>}
          <OpenToggle isOpen={commerce.is_open} />
        </div>
      </div>
      {!commerce.is_open && (
        <p className="mt-2 text-sm text-slate-500">
          Ton commerce est marqué fermé : il n&apos;apparaît plus disponible à la commande pour les clients.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link href="/commerce/commandes">
          <Card interactive className="flex items-center gap-3">
            <ClipboardList className="h-6 w-6 text-brand-600" aria-hidden />
            <div>
              <p className="text-2xl font-bold text-slate-900">{pendingCount ?? 0}</p>
              <p className="text-sm text-slate-500">Nouvelles commandes</p>
            </div>
          </Card>
        </Link>

        <Link href="/commerce/commandes?filter=active">
          <Card interactive className="flex items-center gap-3">
            <Package className="h-6 w-6 text-blue-600" aria-hidden />
            <div>
              <p className="text-2xl font-bold text-slate-900">{activeCount ?? 0}</p>
              <p className="text-sm text-slate-500">Commandes en cours</p>
            </div>
          </Card>
        </Link>

        <Link href="/commerce/equipe">
          <Card interactive className="flex items-center gap-3">
            <Users className="h-6 w-6 text-slate-600" aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-900">Équipe de livraison</p>
              <p className="text-sm text-slate-500">Gérer le personnel</p>
            </div>
          </Card>
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/commerce/commandes" className="text-sm font-medium text-brand-600 hover:underline">
          Voir les commandes →
        </Link>
        <Link href="/commerce/produits" className="text-sm font-medium text-brand-600 hover:underline">
          Gérer le catalogue →
        </Link>
      </div>
    </main>
  )
}
