import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  className?: string
  label?: string
}

// État de chargement générique utilisé par les loading.tsx de chaque
// segment de route (convention Next.js App Router) — affiché pendant que
// le Server Component de la page résout ses données.
export function LoadingSpinner({ className, label = 'Chargement…' }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-400', className)}>
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  )
}
