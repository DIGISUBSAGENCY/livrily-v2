import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Fusionne des classes Tailwind conditionnelles sans conflits (ex: deux
// classes "p-2" et "p-4" passées ensemble → seule la dernière est gardée).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
