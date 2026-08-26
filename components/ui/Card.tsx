import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Surface cliquable (généralement enveloppée dans un <Link>) : léger
  // soulèvement + ombre plus marquée au survol, au lieu de classes
  // hover:shadow-* répétées à la main dans chaque composant appelant.
  interactive?: boolean
}

export function Card({ className, interactive = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/70 bg-white p-6 shadow-soft',
        interactive && 'transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-soft-lg',
        className
      )}
      {...props}
    />
  )
}
