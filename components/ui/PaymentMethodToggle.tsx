'use client'

import { cn } from '@/lib/utils'

export type PaymentMethodChoice = 'virement' | 'flouci'

interface PaymentMethodToggleProps {
  method: PaymentMethodChoice
  onChange: (method: PaymentMethodChoice) => void
}

// Sélecteur de méthode de paiement partagé (refonte v3, vague B) —
// remplace la même paire de boutons toggle copiée à l'identique dans
// AcceptProposalPayment/TakeProductOfferPayment/WalletDepositForm.
// Volontairement limité aux 2 méthodes en ligne du projet (le cash,
// troisième valeur de l'enum DB, n'est jamais proposé pour un paiement
// séquestré/en ligne).
export function PaymentMethodToggle({ method, onChange }: PaymentMethodToggleProps) {
  return (
    <div className="flex gap-2">
      {(['virement', 'flouci'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium',
            method === value ? 'bg-brand-600 text-white' : 'border border-slate-300 bg-white text-slate-600'
          )}
        >
          {value === 'virement' ? 'Virement' : 'Flouci'}
        </button>
      ))}
    </div>
  )
}
