import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LinkOwnerForm } from '@/components/admin/LinkOwnerForm'
import { UnlinkOwnerButton } from '@/components/admin/UnlinkOwnerButton'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

// Lie un commerce à un compte utilisateur (role → 'commerce'). Si l'email
// saisi ne correspond à aucun compte existant, un nouveau compte est créé
// et invité par email (cf. actions.ts). Un commerce a au plus un compte lié
// (contrainte unique commerces_owner_unique_idx).
export default async function AdminComptesCommercePage() {
  const supabase = await createClient()

  const { data: commerces, error } = await supabase.from('commerces').select('id, name, owner_id').order('name')

  const ownerIds = Array.from(new Set((commerces ?? []).map((c) => c.owner_id).filter((id): id is string => !!id)))
  const { data: owners } = ownerIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', ownerIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const ownerById = new Map((owners ?? []).map((o) => [o.id, o]))

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <Users className="h-6 w-6 text-brand-600" aria-hidden />
        Comptes commerce
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Lie un commerce à un compte utilisateur pour lui donner accès à son espace de gestion.
      </p>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger les commerces.</p>}

      {!error && commerces && commerces.length > 0 && (
        <div className="mt-6 space-y-3">
          {commerces.map((commerce) => {
            const owner = commerce.owner_id ? ownerById.get(commerce.owner_id) : null
            return (
              <Card key={commerce.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{commerce.name}</p>
                  {owner ? <Badge tone="success">Lié</Badge> : <Badge tone="neutral">Non lié</Badge>}
                </div>

                {owner ? (
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-600">
                    <span>{owner.full_name ?? owner.email}</span>
                    <UnlinkOwnerButton commerceId={commerce.id} />
                  </div>
                ) : (
                  <div className="mt-3">
                    <LinkOwnerForm commerceId={commerce.id} />
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
