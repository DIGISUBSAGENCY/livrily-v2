'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { toggleBankTransferActive } from '@/app/(admin)/admin/parametres/virement/actions'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { BankTransferInfo } from '@/types/database'

export function BankTransferRow({ bankInfo }: { bankInfo: BankTransferInfo }) {
  const [isActive, setIsActive] = useState(bankInfo.is_active)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !isActive
    setIsActive(next)
    startTransition(async () => {
      const result = await toggleBankTransferActive(bankInfo.id, next)
      if (result.error) {
        setIsActive(!next)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{bankInfo.bank_name}</p>
        <p className="text-sm text-slate-500">{bankInfo.account_holder} · {bankInfo.rib}</p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <button type="button" onClick={handleToggle} disabled={isPending} className={cn('flex-shrink-0', isPending && 'opacity-60')}>
        <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Actif' : 'Inactif'}</Badge>
      </button>

      <Link href={`/admin/parametres/virement/${bankInfo.id}`} className="p-2 text-slate-500 transition-colors hover:text-slate-900" aria-label="Modifier">
        <Pencil className="h-4 w-4" />
      </Link>
    </div>
  )
}
