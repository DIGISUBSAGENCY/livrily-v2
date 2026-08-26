import Link from 'next/link'
import { Users, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { UserRow } from '@/components/admin/UserRow'
import { UserSearchFilters } from '@/components/admin/UserSearchFilters'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

interface AdminUsersPageProps {
  searchParams: Promise<{ q?: string; status?: string; type?: string; sort?: string }>
}

// Limite pragmatique à 100 lignes — aucune page admin n'a de pagination
// pour l'instant, pas de raison d'en introduire une ici en avance de phase.
const PAGE_LIMIT = 100

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const { q = '', status = 'all', type = 'all', sort = 'name_asc' } = await searchParams
  const supabase = await createClient()

  // "Voyageur" n'est pas un rôle (profiles.role ne connaît que client/
  // admin) — c'est un compte client ayant déjà fait au moins une
  // proposition Jibli. Filtre dérivé, résolu en amont via une requête sur
  // travel_proposals plutôt qu'une colonne directe.
  let voyageurIds: string[] | null = null
  if (type === 'voyageur') {
    const { data: proposals } = await supabase.from('travel_proposals').select('voyageur_id')
    voyageurIds = Array.from(new Set((proposals ?? []).map((p) => p.voyageur_id)))
  }

  let query = supabase.from('profiles').select('*').eq('role', 'client')

  if (status === 'active') query = query.eq('is_active', true)
  if (status === 'suspended') query = query.eq('is_active', false)
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
  if (voyageurIds) query = query.in('id', voyageurIds.length > 0 ? voyageurIds : ['00000000-0000-0000-0000-000000000000'])

  if (sort === 'balance_desc') query = query.order('wallet_balance', { ascending: false })
  else if (sort === 'created_desc') query = query.order('created_at', { ascending: false })
  else query = query.order('full_name', { ascending: true })

  const { data: users, error } = await query.limit(PAGE_LIMIT)
  const sortedUsers = users ?? []

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <Users className="h-6 w-6 text-brand-600" aria-hidden />
          Utilisateurs
        </h1>
        <Link href="/admin/utilisateurs/nouveau">
          <Button size="sm">
            <Plus className="h-4 w-4" aria-hidden />
            Créer un utilisateur
          </Button>
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Comptes clients (inclut les voyageurs — même rôle, pas de distinction en base).
      </p>

      <div className="mt-6">
        <UserSearchFilters defaultQuery={q} defaultStatus={status} defaultType={type} defaultSort={sort} />
      </div>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les utilisateurs.</p>}

      {!error && sortedUsers.length === 0 && (
        <EmptyState icon={Users}>
          <p>Aucun utilisateur ne correspond à ces critères.</p>
        </EmptyState>
      )}

      {!error && sortedUsers.length > 0 && (
        <Card className="mt-6 p-3">
          <div className="grid grid-cols-[1.5fr_1fr_auto_1fr_1fr] gap-3 border-b border-slate-200 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span>Nom</span>
            <span>Téléphone</span>
            <span>Statut</span>
            <span>Solde</span>
            <span>Inscription</span>
          </div>
          {sortedUsers.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </Card>
      )}
    </main>
  )
}
