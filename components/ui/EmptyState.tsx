import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  // Contenu libre (texte simple, CTA, liens multiples, branches
  // conditionnelles selon filtres actifs…) : les ~24 états vides du projet
  // partagent exactement le conteneur + l'icône, mais pas leur contenu —
  // le composant standardise le contenant, pas le message.
  children: ReactNode
  // Espacement contextuel : mt-16 par défaut (pleine page), surchargeable
  // (mt-10 sous une barre de filtres, py-10 dans une Card) — cn/twMerge
  // dédoublonne.
  className?: string
}

// État vide partagé (refonte v3, vague B) — remplace le pattern
// icône-centrée + texte copié dans ~24 écrans, et sert de standard aux
// écrans qui n'avaient qu'un <p> sec.
export function EmptyState({ icon: Icon, children, className }: EmptyStateProps) {
  return (
    <div className={cn('mt-16 flex flex-col items-center text-center text-slate-500', className)}>
      <Icon className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
      {children}
    </div>
  )
}
