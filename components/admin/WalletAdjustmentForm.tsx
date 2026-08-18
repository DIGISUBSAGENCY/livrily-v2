'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adjustUserWallet } from '@/app/(admin)/admin/utilisateurs/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'
import { formatTND } from '@/lib/format'

// Formulaire replié par défaut (bouton "Ajuster le solde") pour ne pas
// alourdir la page détail. Confirmation explicite avant envoi (window.confirm
// avec le montant ET la raison affichés) — même pattern que WithdrawalActions/
// OrderPaymentActions (useTransition + appel manuel du Server Action plutôt
// que <form action=...>, pour pouvoir intercepter avant soumission).
export function WalletAdjustmentForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount === 0) {
      setError('Montant invalide.')
      return
    }
    if (reason.trim().length < 5) {
      setError('Une raison détaillée est requise (5 caractères minimum).')
      return
    }

    const sign = parsedAmount > 0 ? '+' : ''
    if (
      !window.confirm(
        `Confirmer l'ajustement de ${sign}${formatTND(parsedAmount)} ?\n\nRaison : ${reason.trim()}`
      )
    )
      return

    setError(null)
    const formData = new FormData()
    formData.set('amount', amount)
    formData.set('reason', reason)

    startTransition(async () => {
      const result = await adjustUserWallet(userId, formData)
      if (result.error) {
        setError(result.error)
      } else {
        setAmount('')
        setReason('')
        setIsOpen(false)
        router.refresh()
      }
    })
  }

  if (!isOpen) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setIsOpen(true)}>
        Ajuster le solde
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <Label htmlFor="wallet_amount">Montant (DT) — positif pour créditer, négatif pour débiter</Label>
        <Input
          id="wallet_amount"
          type="number"
          step="0.001"
          placeholder="ex : 50 ou -20"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hasError={!!error}
        />
      </div>
      <div>
        <Label htmlFor="wallet_reason">Raison (obligatoire)</Label>
        <textarea
          id="wallet_reason"
          rows={2}
          placeholder="ex : Remboursement litige commande #123"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          Valider l&apos;ajustement
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setIsOpen(false)
            setError(null)
          }}
        >
          Annuler
        </Button>
      </div>
    </form>
  )
}
