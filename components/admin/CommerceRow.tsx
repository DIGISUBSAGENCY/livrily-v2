'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Package } from 'lucide-react'
import { deleteCommerce, toggleCommerceActive } from '@/app/(admin)/admin/commerces/actions'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { Commerce, CommerceCategory } from '@/types/database'

const categoryLabels: Record<CommerceCategory, string> = {
  supermarche: 'Supermarché',
  boulangerie: 'Boulangerie',
  fruits_legumes: 'Fruits & légumes',
  pharmacie: 'Pharmacie',
}

export function CommerceRow({ commerce }: { commerce: Commerce }) {
  const [isActive, setIsActive] = useState(commerce.is_active)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !isActive
    setIsActive(next)
    startTransition(async () => {
      const result = await toggleCommerceActive(commerce.id, next)
      if (result.error) {
        setIsActive(!next)
        setError(result.error)
      }
    })
  }

  function handleDelete() {
    // products.commerce_id est en "on delete cascade" : supprimer le
    // commerce supprime aussi tout son catalogue, sans étape de retour en
    // arrière — le message le dit explicitement plutôt que de laisser
    // deviner l'ampleur de l'action.
    if (!window.confirm(`Supprimer "${commerce.name}" ? Son catalogue produits sera supprimé avec lui. Cette action est irréversible.`))
      return
    startTransition(async () => {
      const result = await deleteCommerce(commerce.id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{commerce.name}</p>
        <p className="text-sm text-slate-500">{categoryLabels[commerce.category]}</p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <button type="button" onClick={handleToggle} disabled={isPending} className={cn('flex-shrink-0', isPending && 'opacity-60')}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Actif' : 'Inactif'}</Badge>
      </button>

      <Link
        href={`/admin/commerces/${commerce.id}/produits`}
        className="p-2 text-slate-500 transition-colors hover:text-slate-900"
        aria-label="Produits"
      >
        <Package className="h-4 w-4" />
      </Link>
      <Link href={`/admin/commerces/${commerce.id}`} className="p-2 text-slate-500 transition-colors hover:text-slate-900" aria-label="Modifier">
        <Pencil className="h-4 w-4" />
      </Link>
      <button type="button" onClick={handleDelete} className="p-2 text-slate-500 transition-colors hover:text-red-600" aria-label="Supprimer">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
