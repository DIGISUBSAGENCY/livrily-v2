import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// Échelle typographique v3 (vague B) — de VRAIS composants plutôt qu'une
// convention documentée (décision explicite) : la cohérence ne doit pas
// reposer sur la discipline manuelle à chaque nouveau fichier. Échelle
// figée par l'audit Phase 1 sur le standard de fait du produit (47/61 h1
// suivaient déjà la forme 'h1' ci-dessous — les composants la rendent
// obligatoire au lieu de probable).
//
// Adoption page par page en vague C — AUCUNE page n'est migrée par ce
// commit (un remplacement global des 60+ fichiers serait le big bang que
// le plan interdit).

type HeadingLevel = 'display' | 'h1' | 'h2' | 'h3'

const headingClasses: Record<HeadingLevel, string> = {
  // Hero uniquement (accueil) — jamais une page intérieure.
  display: 'text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl',
  h1: 'text-2xl font-bold tracking-tight text-slate-900',
  h2: 'text-lg font-semibold text-slate-900',
  h3: 'font-semibold text-slate-900',
}

// Balise HTML rendue = le niveau visuel par défaut, découplable via `as`
// (ex: un h2 sémantique rendu au niveau visuel h3 dans une Card dense).
const defaultTag: Record<HeadingLevel, 'h1' | 'h2' | 'h3'> = {
  display: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
}

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level: HeadingLevel
  as?: 'h1' | 'h2' | 'h3' | 'h4'
}

export function Heading({ level, as, className, ...props }: HeadingProps) {
  const Tag = as ?? defaultTag[level]
  return <Tag className={cn(headingClasses[level], className)} {...props} />
}

// Sur-titre de section (petites capitales grises) — pattern déjà présent
// en 7 exemplaires manuscrits dans le produit, formalisé ici.
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm font-semibold uppercase tracking-wide text-slate-400', className)} {...props} />
  )
}

// Texte tertiaire (dates, méta, mentions) — le plus petit niveau de
// l'échelle, jamais pour du contenu porteur d'action.
export function Caption({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-slate-500', className)} {...props} />
}
