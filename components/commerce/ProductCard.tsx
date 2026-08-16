'use client'

import { useState } from 'react'
import { Minus, Plus, ShoppingCart, FileText } from 'lucide-react'
import { useCart } from '@/lib/cart/CartContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatTND } from '@/lib/format'
import type { Product } from '@/types/database'

interface ProductCardProps {
  product: Product
  commerceId: string
  commerceName: string
  disabled?: boolean
}

export function ProductCard({ product, commerceId, commerceName, disabled }: ProductCardProps) {
  const { addItem } = useCart()
  const [quantity, setQuantity] = useState(1)
  const [justAdded, setJustAdded] = useState(false)

  function handleAdd() {
    addItem(
      {
        productId: product.id,
        commerceId,
        commerceName,
        name: product.name,
        price: product.price,
        unit: product.unit,
        imageUrl: product.image_url,
        requiresPrescription: product.requires_prescription,
      },
      quantity
    )
    setQuantity(1)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1500)
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex h-28 items-center justify-center rounded-lg bg-slate-100">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- images externes variées par commerce
          <img src={product.image_url} alt={product.name} className="h-full w-full rounded-lg object-cover" />
        ) : (
          <span className="text-xs text-slate-400">Pas de photo</span>
        )}
      </div>

      <div className="flex-1">
        <h3 className="font-medium text-slate-900">{product.name}</h3>
        {product.description && <p className="mt-0.5 text-sm text-slate-500">{product.description}</p>}
        <p className="mt-1 text-sm font-semibold text-brand-700">
          {formatTND(product.price)} <span className="font-normal text-slate-400">/ {product.unit}</span>
        </p>
        {product.requires_prescription && (
          <Badge tone="warning" className="mt-1.5 flex w-fit items-center gap-1">
            <FileText className="h-3 w-3" aria-hidden />
            Ordonnance requise
          </Badge>
        )}
      </div>

      {disabled ? (
        <p className="text-center text-xs text-slate-400">Commerce fermé pour le moment</p>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="p-2 text-slate-500 transition-colors hover:text-slate-900"
              aria-label="Diminuer la quantité"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-sm font-medium">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(50, q + 1))}
              className="p-2 text-slate-500 transition-colors hover:text-slate-900"
              aria-label="Augmenter la quantité"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <Button type="button" size="sm" className="flex-1" onClick={handleAdd}>
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {justAdded ? 'Ajouté ✓' : 'Ajouter'}
          </Button>
        </div>
      )}
    </Card>
  )
}
