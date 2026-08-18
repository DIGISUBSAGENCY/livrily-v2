import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900',
          'transition duration-150 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
          hasError ? 'border-red-400' : 'border-slate-300',
          className
        )}
        {...props}
      />
    )
  }
)
Select.displayName = 'Select'
