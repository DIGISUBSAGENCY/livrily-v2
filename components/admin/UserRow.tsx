import Link from 'next/link'
import { AccountStatusBadge } from '@/components/admin/AccountStatusBadge'
import { formatTND } from '@/lib/format'
import type { Profile } from '@/types/database'

interface UserRowProps {
  user: Profile
}

export function UserRow({ user }: UserRowProps) {
  return (
    <Link href={`/admin/utilisateurs/${user.id}`}>
      <div className="grid grid-cols-[1.5fr_1fr_auto_1fr_1fr] items-center gap-3 border-b border-slate-100 px-1 py-3 text-sm last:border-0 hover:bg-slate-50">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{user.full_name ?? 'Sans nom'}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <p className="text-slate-600">{user.phone ?? '—'}</p>
        <AccountStatusBadge isActive={user.is_active} />
        <p className="font-medium text-slate-900">{formatTND(user.wallet_balance)}</p>
        <p className="text-xs text-slate-400">{new Date(user.created_at).toLocaleDateString('fr-TN')}</p>
      </div>
    </Link>
  )
}
