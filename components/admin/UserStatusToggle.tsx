'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleUserActive } from '@/app/(admin)/admin/utilisateurs/actions'
import { AccountStatusBadge } from '@/components/admin/AccountStatusBadge'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export function UserStatusToggle({ userId, initialIsActive }: { userId: string; initialIsActive: boolean }) {
  const router = useRouter()
  const [isActive, setIsActive] = useState(initialIsActive)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleToggle() {
    const next = !isActive
    const confirmMessage = next
      ? 'Réactiver ce compte ?'
      : 'Suspendre ce compte ? Le compte ne pourra plus se connecter tant que non réactivé.'
    if (!window.confirm(confirmMessage)) return

    setError(null)
    startTransition(async () => {
      const result = await toggleUserActive(userId, next)
      if (result.error) {
        setError(result.error)
      } else {
        setIsActive(next)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <AccountStatusBadge isActive={isActive} />
      <Button size="sm" variant={isActive ? 'danger' : 'primary'} disabled={isPending} onClick={handleToggle}>
        {isActive ? 'Suspendre' : 'Réactiver'}
      </Button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}
