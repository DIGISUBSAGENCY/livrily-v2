'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOrderStatus, markOrderDelivered } from '@/app/(commerce)/commerce/commandes/actions'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import type { CommerceDeliveryStaff, OrderStatus, PaymentMethod, PaymentStatus } from '@/types/database'

interface OrderActionsProps {
  orderId: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  staff: CommerceDeliveryStaff[]
}

export function OrderActions({ orderId, status, paymentMethod, paymentStatus, staff }: OrderActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [staffId, setStaffId] = useState('')

  function run(next: OrderStatus, options?: Parameters<typeof updateOrderStatus>[2]) {
    setError(null)
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, next, options)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleMarkDelivered(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await markOrderDelivered(orderId, formData)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  if (status === 'delivered' || status === 'cancelled') return null

  const virementUnpaid = paymentMethod === 'virement' && paymentStatus !== 'paid'

  return (
    <div className="space-y-3">
      {status === 'pending' && (
        <>
          {virementUnpaid && (
            <p className="text-sm text-amber-700">
              Paiement par virement en attente de vérification — impossible d&apos;accepter tant
              que l&apos;admin n&apos;a pas validé.
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={isPending || virementUnpaid} onClick={() => run('accepted')}>
              Accepter
            </Button>
            <Button
              variant="danger"
              disabled={isPending}
              onClick={() => run('cancelled', { cancelledReason: 'Refusée par le commerce' })}
            >
              Refuser
            </Button>
          </div>
        </>
      )}

      {status === 'accepted' && (
        <div className="flex gap-2">
          <Button disabled={isPending} onClick={() => run('ready')}>
            Marquer prête
          </Button>
          <Button variant="danger" disabled={isPending} onClick={() => run('cancelled')}>
            Annuler
          </Button>
        </div>
      )}

      {status === 'ready' && (
        <div className="space-y-2">
          {staff.length > 0 && (
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 sm:w-auto"
            >
              <option value="">Livré par le gérant</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <Button disabled={isPending} onClick={() => run('delivering', { deliveryStaffId: staffId || null })}>
              Démarrer la livraison
            </Button>
            <Button variant="danger" disabled={isPending} onClick={() => run('cancelled')}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {status === 'delivering' && (
        <form action={handleMarkDelivered} className="space-y-2">
          <div>
            <Label htmlFor="delivery_proof">Photo de preuve (obligatoire)</Label>
            <input
              id="delivery_proof"
              name="delivery_proof"
              type="file"
              accept="image/*"
              capture="environment"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          <Button type="submit" disabled={isPending}>
            Marquer livrée
          </Button>
        </form>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
