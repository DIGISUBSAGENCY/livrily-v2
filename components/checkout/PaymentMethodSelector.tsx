'use client'

import { cn } from '@/lib/utils'
import { PaymentCash } from '@/components/checkout/PaymentCash'
import { PaymentFlouci } from '@/components/checkout/PaymentFlouci'
import { PaymentVirement } from '@/components/checkout/PaymentVirement'
import { Label } from '@/components/ui/Label'
import type { BankTransferInfo, PaymentMethod } from '@/types/database'

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash à la livraison' },
  { value: 'flouci', label: 'Flouci' },
  { value: 'virement', label: 'Virement bancaire' },
]

interface PaymentMethodSelectorProps {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
  bankInfo: BankTransferInfo | null
}

export function PaymentMethodSelector({ value, onChange, bankInfo }: PaymentMethodSelectorProps) {
  return (
    <div className="space-y-3">
      <Label>Mode de paiement</Label>

      <div className="grid gap-2 sm:grid-cols-3">
        {methods.map((method) => (
          <button
            key={method.value}
            type="button"
            onClick={() => onChange(method.value)}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
              value === method.value
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            )}
          >
            {method.label}
          </button>
        ))}
      </div>

      {/* Champ réellement soumis au Server Action. */}
      <input type="hidden" name="payment_method" value={value} />

      <div className="pt-1">
        {value === 'cash' && <PaymentCash />}
        {value === 'flouci' && <PaymentFlouci />}
        {value === 'virement' && <PaymentVirement bankInfo={bankInfo} />}
      </div>
    </div>
  )
}
