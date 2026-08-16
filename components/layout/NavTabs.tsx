'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavTabsProps {
  links: { href: string; label: string }[]
  maxWidthClassName?: string
}

// Nav à onglets partagée par les layouts /commerce et /admin, avec l'onglet
// actif mis en évidence (jusqu'ici absent des deux — tous les liens avaient
// exactement le même style, actif ou non). Le lien le plus SPÉCIFIQUE
// l'emporte quand plusieurs correspondent (ex: sur /commerce/commandes,
// "/commerce" matche aussi en préfixe mais "/commerce/commandes" est plus
// long donc gagne) — sinon le premier onglet (racine de section) resterait
// actif en permanence sur toutes les sous-pages.
export function NavTabs({ links, maxWidthClassName = 'max-w-4xl' }: NavTabsProps) {
  const pathname = usePathname()

  const activeHref = links
    .map((l) => l.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0]

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className={cn('mx-auto flex gap-1 overflow-x-auto px-4', maxWidthClassName)}>
        {links.map((link) => {
          const isActive = link.href === activeHref
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-600 hover:text-brand-600'
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
