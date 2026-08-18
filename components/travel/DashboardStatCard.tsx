import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface DashboardStatCardProps {
  icon: LucideIcon
  value: number
  label: string
}

export function DashboardStatCard({ icon: Icon, value, label }: DashboardStatCardProps) {
  return (
    <Card className="flex items-center gap-3">
      <Icon className="h-6 w-6 text-brand-600" aria-hidden />
      <div>
        <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </Card>
  )
}
