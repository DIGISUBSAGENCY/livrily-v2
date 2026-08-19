'use client'

import { Minus, Plus } from 'lucide-react'

interface AmountStepperProps {
  id: string
  name: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  hasError?: boolean
}

// Ajuste par pas plutôt que de taper le montant au clavier — le voyageur
// PROPOSE ce montant (frais de service), le client l'accepte ou
// contre-propose ; ce n'est jamais un prix fixé par la plateforme.
export function AmountStepper({ id, name, value, onChange, step = 1, min = 0 }: AmountStepperProps) {
  const round = (n: number) => Math.round(n * 1000) / 1000

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(round(Math.max(min, value - step)))}
        aria-label="Diminuer"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 active:scale-95"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <input
        id={id}
        name={name}
        type="number"
        step="0.001"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-center text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={() => onChange(round(value + step))}
        aria-label="Augmenter"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 active:scale-95"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
