import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

// Champ fichier partagé (refonte v3, vague B) — remplace la même chaîne de
// classes file:* dupliquée à l'identique dans 8 formulaires (preuves de
// virement, KYC, photos d'annonces). type="file" et accept="image/*" par
// défaut : tous les usages du projet sont des images ; surchargeables via
// props comme le reste.
type FileInputProps = InputHTMLAttributes<HTMLInputElement>

export const FileInput = forwardRef<HTMLInputElement, FileInputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      className={cn(
        'block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100',
        className
      )}
      {...props}
    />
  )
})
FileInput.displayName = 'FileInput'
