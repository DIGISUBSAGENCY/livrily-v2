import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon?: LucideIcon
  value: string | number
  label: string
  className?: string
}

// Tuile de statistique partagée — ex-DashboardStatCard (fusionnée ici,
// refonte v3 vague B), même rendu.
export function StatCard({ icon: Icon, value, label, className }: StatCardProps) {
  return (
    <Card className={cn('flex items-center gap-3', className)}>
      {Icon && <Icon className="h-6 w-6 text-brand-600" aria-hidden />}
      <div>
        <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Card>
  )
}
