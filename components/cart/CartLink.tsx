'use client'

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/cart/CartContext'

export function CartLink() {
  const { items } = useCart()
  const count = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Link
      href="/checkout"
      className="relative inline-flex items-center rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      aria-label="Panier"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
          {count}
        </span>
      )}
    </Link>
  )
}
