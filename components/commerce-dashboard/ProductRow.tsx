'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteProduct, toggleProductAvailability } from '@/app/(commerce)/commerce/produits/actions'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/database'

interface ProductRowProps {
  product: Product
  // Par défaut, agit sur "mon" catalogue (compte commerce). L'espace admin
  // (/admin/commerces/[id]/produits) passe ses propres actions + son propre
  // lien d'édition pour réutiliser ce composant sans dupliquer le rendu.
  onToggle?: (productId: string, isAvailable: boolean) => Promise<{ error: string | null }>
  onDelete?: (productId: string) => Promise<{ error: string | null }>
  editHref?: string
}

export function ProductRow({
  product,
  onToggle = toggleProductAvailability,
  onDelete = deleteProduct,
  editHref = `/commerce/produits/${product.id}`,
}: ProductRowProps) {
  const [isAvailable, setIsAvailable] = useState(product.is_available)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !isAvailable
    setIsAvailable(next) // optimiste
    startTransition(async () => {
      const result = await onToggle(product.id, next)
      if (result.error) {
        setIsAvailable(!next) // rollback
        setError(result.error)
      }
    })
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer "${product.name}" ? Cette action est irréversible.`)) return
    startTransition(async () => {
      const result = await onDelete(product.id)
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">
          {product.name}
          {product.requires_prescription && (
            <Badge tone="warning" className="ml-2 align-middle">
              Ordonnance
            </Badge>
          )}
        </p>
        <p className="text-sm text-slate-500">
          {formatTND(product.price)} / {product.unit}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={cn('flex-shrink-0', isPending && 'opacity-60')}
      >
        <Badge tone={isAvailable ? 'success' : 'neutral'}>{isAvailable ? 'Disponible' : 'Masqué'}</Badge>
      </button>

      <Link href={editHref} className="p-2 text-slate-500 transition-colors hover:text-slate-900" aria-label="Modifier">
        <Pencil className="h-4 w-4" />
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        className="p-2 text-slate-500 transition-colors hover:text-red-600"
        aria-label="Supprimer"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
