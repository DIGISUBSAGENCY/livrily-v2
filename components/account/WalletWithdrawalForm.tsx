'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestWalletWithdrawal } from '@/app/(client)/jibli/dashboard/actions'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Mirror de RequestWithdrawalButton (mes-gains) — même mécanique
// (useTransition + router.refresh), mais avec un champ montant : le
// retrait ici est partiel et libre (contrairement au système B, qui ne
// retire que le solde total).
export function WalletWithdrawalForm({ balance }: { balance: number }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRequest() {
    const parsed = Number(amount)
    if (!amount || !Number.isFinite(parsed) || parsed <= 0) {
      setError('Indique un montant valide.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await requestWalletWithdrawal(parsed)
      if (result.error) setError(result.error)
      else {
        setAmount('')
        router.refresh()
      }
    })
  }

  if (balance <= 0) {
    return <p className="text-sm text-slate-500">Aucun solde disponible pour un retrait.</p>
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="withdrawal_amount">Montant à retirer (TND)</Label>
        <Input
          id="withdrawal_amount"
          type="number"
          step="0.001"
          min="0.001"
          max={balance}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hasError={!!error}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <Button size="sm" disabled={isPending} onClick={handleRequest}>
        {isPending ? 'Envoi…' : 'Demander le retrait'}
      </Button>
    </div>
  )
}
