'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart/CartContext'
import { formatTND } from '@/lib/format'
import { Button } from '@/components/ui/Button'

// Barre sticky affichée sur la page produits d'un commerce, uniquement
// quand le panier contient des articles de CE commerce.
export function CartBar({ commerceId }: { commerceId: string }) {
  const { items } = useCart()
  const commerceItems = items.filter((i) => i.commerceId === commerceId)

  if (commerceItems.length === 0) return null

  const count = commerceItems.reduce((sum, i) => sum + i.quantity, 0)
  const subtotal = commerceItems.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <div className="sticky bottom-4 z-30 mx-auto mt-6 flex max-w-md items-center justify-between gap-4 rounded-xl bg-slate-900 px-5 py-3.5 text-white shadow-lg">
      <span className="text-sm">
        {count} article{count > 1 ? 's' : ''} · {formatTND(subtotal)}
      </span>
      <Link href="/checkout">
        <Button size="sm" variant="primary">
          Voir le panier
        </Button>
      </Link>
    </div>
  )
}
