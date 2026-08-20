'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  icon: LucideIcon
  title: string
  description?: string
  defaultOpen?: boolean
  children: ReactNode
}

// Card + en-tête cliquable qui replie/déplie son contenu — pattern maison
// (pas de primitive Radix/headless en dépendance dans ce projet), même
// esprit que le chevron rotatif d'AdminNav.tsx.
export function CollapsibleSection({ icon: Icon, title, description, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden />
          <div>
            <p className="font-semibold text-slate-900">{title}</p>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')} aria-hidden />
      </button>

      {isOpen && <div className="border-t border-slate-100 p-6">{children}</div>}
    </Card>
  )
}
