'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleCommerceOpen } from '@/app/(commerce)/commerce/actions'
import { ErrorText } from '@/components/ui/ErrorText'
import { cn } from '@/lib/utils'

export function OpenToggle({ isOpen }: { isOpen: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    setError(null)
    const next = !isOpen
    startTransition(async () => {
      const result = await toggleCommerceOpen(next)
      if (result.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        className={cn(
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60',
          isOpen
            ? 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
        )}
        aria-pressed={isOpen}
      >
        <span className={cn('h-2 w-2 rounded-full', isOpen ? 'bg-brand-500' : 'bg-slate-400')} aria-hidden />
        {isPending ? '...' : isOpen ? 'Ouvert · fermer' : 'Fermé · ouvrir'}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
