import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CardVariant = 'default' | 'ledger'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Surface cliquable (généralement enveloppée dans un <Link>) : léger
  // soulèvement + ombre plus marquée au survol, au lieu de classes
  // hover:shadow-* répétées à la main dans chaque composant appelant.
  interactive?: boolean
  // 'ledger' = nouvelle direction visuelle (cf. audit design/UX) : encore
  // opt-in, ne remplace pas 'default' tant que les pages n'ont pas migré.
  variant?: CardVariant
}

const variantClasses: Record<CardVariant, string> = {
  default: 'rounded-xl border border-slate-200/70 bg-white p-6 shadow-soft',
  // À plat : la profondeur vient du hairline, pas de l'ombre — cohérent
  // avec l'esthétique "manifeste douanier" de Ledger.
  ledger: 'rounded-ledger border border-ledger-line bg-ledger-surface p-6',
}

const interactiveClasses: Record<CardVariant, string> = {
  default: 'transition duration-150 ease-out hover:-translate-y-0.5 hover:shadow-soft-lg',
  ledger: 'transition duration-150 ease-out hover:border-ledger-ink/40',
}

export function Card({ className, interactive = false, variant = 'default', ...props }: CardProps) {
  return (
    <div
      className={cn(variantClasses[variant], interactive && interactiveClasses[variant], className)}
      {...props}
    />
  )
}
