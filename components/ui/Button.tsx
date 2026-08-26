import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'rounded-lg bg-brand-600 text-white shadow-soft hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none focus-visible:ring-brand-500',
  secondary:
    'rounded-lg bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400 focus-visible:ring-brand-500',
  ghost:
    'rounded-lg bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-300 focus-visible:ring-brand-500',
  danger: 'rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 focus-visible:ring-brand-500',
  // Contour de marque (refonte v3, vague B) : CTA secondaire distinctif à
  // côté d'un primaire plein — formalise l'override local que l'accueil
  // improvisait via className, preuve que le besoin était réel.
  outline:
    'rounded-lg border-2 border-brand-600 bg-transparent text-brand-700 shadow-none hover:bg-brand-50 disabled:border-brand-300 disabled:text-brand-300 focus-visible:ring-brand-500',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium',
          'transition duration-150 ease-out active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:active:scale-100',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
