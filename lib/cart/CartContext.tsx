'use client'

// Panier client, persisté en localStorage. Volontairement limité à UN SEUL
// commerce à la fois : le schéma (orders.commerce_id) ne permet pas de
// livrer une commande multi-commerces, donc ajouter un article d'un autre
// commerce vide d'abord le panier courant (avec confirmation).
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'

export interface CartItem {
  productId: string
  commerceId: string
  commerceName: string
  name: string
  price: number
  unit: string
  imageUrl: string | null
  quantity: number
  requiresPrescription: boolean
}

interface CartState {
  items: CartItem[]
}

type CartAction =
  | { type: 'HYDRATE'; items: CartItem[] }
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity'>; quantity: number }
  | { type: 'SET_QUANTITY'; productId: string; quantity: number }
  | { type: 'REMOVE_ITEM'; productId: string }
  | { type: 'CLEAR' }

const STORAGE_KEY = 'livrily_cart'

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items }
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.productId === action.item.productId)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === action.item.productId ? { ...i, quantity: i.quantity + action.quantity } : i
          ),
        }
      }
      return { items: [...state.items, { ...action.item, quantity: action.quantity }] }
    }
    case 'SET_QUANTITY':
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.productId !== action.productId) }
      }
      return {
        items: state.items.map((i) =>
          i.productId === action.productId ? { ...i, quantity: action.quantity } : i
        ),
      }
    case 'REMOVE_ITEM':
      return { items: state.items.filter((i) => i.productId !== action.productId) }
    case 'CLEAR':
      return { items: [] }
    default:
      return state
  }
}

interface CartContextValue {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void
  setQuantity: (productId: string, quantity: number) => void
  removeItem: (productId: string) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] })

  // Hydratation depuis localStorage après le premier rendu (évite un
  // mismatch SSR/client, le serveur ne connaît jamais le panier).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        dispatch({ type: 'HYDRATE', items: JSON.parse(raw) as CartItem[] })
      }
    } catch {
      // localStorage indisponible ou contenu corrompu : on repart d'un panier vide.
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items))
    } catch {
      // Stockage plein/indisponible : le panier reste fonctionnel pour la session en cours.
    }
  }, [state.items])

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      addItem: (item, quantity = 1) => {
        const hasOtherCommerce = state.items.length > 0 && state.items[0].commerceId !== item.commerceId
        if (hasOtherCommerce) {
          const confirmed = window.confirm(
            `Ton panier contient déjà des articles de "${state.items[0].commerceName}". Le vider pour ajouter des articles de "${item.commerceName}" ?`
          )
          if (!confirmed) return
          dispatch({ type: 'CLEAR' })
        }
        dispatch({ type: 'ADD_ITEM', item, quantity })
      },
      setQuantity: (productId, quantity) => dispatch({ type: 'SET_QUANTITY', productId, quantity }),
      removeItem: (productId) => dispatch({ type: 'REMOVE_ITEM', productId }),
      clearCart: () => dispatch({ type: 'CLEAR' }),
    }),
    [state.items]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart doit être utilisé sous <CartProvider>.')
  return ctx
}
