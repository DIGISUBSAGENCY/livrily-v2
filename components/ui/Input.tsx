import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-lg border px-3 text-sm text-slate-900 placeholder:text-slate-400',
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
Input.displayName = 'Input'
