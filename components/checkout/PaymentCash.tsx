import { Banknote } from 'lucide-react'

export function PaymentCash() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <Banknote className="h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden />
      <p>Tu payeras en espèces directement à la réception de ta commande.</p>
    </div>
  )
}
