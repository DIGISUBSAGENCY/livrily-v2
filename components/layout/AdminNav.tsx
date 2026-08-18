'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavLink {
  href: string
  label: string
}

interface NavGroup {
  label: string
  links: NavLink[]
}

type NavItem = NavLink | NavGroup

function isGroup(item: NavItem): item is NavGroup {
  return 'links' in item
}

// Nav admin dédiée, regroupée en sous-menus — remplace NavTabs UNIQUEMENT
// dans app/(admin)/admin/layout.tsx. NavTabs.tsx lui-même n'est pas touché
// et reste utilisé tel quel par /commerce (cf. contrainte "ne restructure
// pas ce qui marche" : /commerce n'a que 4 onglets, pas besoin de
// regroupement, un changement du composant partagé aurait été un risque
// inutile pour un problème qui ne concerne que l'admin).
const items: NavItem[] = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/commandes', label: 'Commandes' },
  { href: '/admin/utilisateurs', label: 'Utilisateurs' },
  {
    label: 'Commerces',
    links: [
      { href: '/admin/commerces', label: 'Commerces' },
      { href: '/admin/zones', label: 'Zones' },
      { href: '/admin/comptes-commerce', label: 'Comptes commerce' },
    ],
  },
  {
    label: 'Paiements',
    links: [
      { href: '/admin/paiements', label: 'Paiements commandes' },
      { href: '/admin/jibli-paiements', label: 'Paiements Jibli' },
      { href: '/admin/retraits', label: 'Retraits' },
    ],
  },
  {
    label: 'Paramètres',
    links: [
      { href: '/admin/parametres', label: "Vue d'ensemble" },
      { href: '/admin/parametres/commission', label: 'Commission' },
      { href: '/admin/parametres/virement', label: 'Virement' },
      { href: '/admin/zones', label: 'Zones' },
    ],
  },
]

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function tabClassName(isActive: boolean): string {
  return cn(
    'flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
    isActive ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:text-brand-600'
  )
}

export function AdminNav() {
  const pathname = usePathname()
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  return (
    <nav className="relative border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4">
        {items.map((item) => {
          if (!isGroup(item)) {
            return (
              <Link key={item.href} href={item.href} className={tabClassName(matchesPath(pathname, item.href))}>
                {item.label}
              </Link>
            )
          }

          const groupActive = item.links.some((link) => matchesPath(pathname, link.href))
          const isOpen = openGroup === item.label

          return (
            <div key={item.label} className="relative">
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : item.label)}
                onBlur={() => setTimeout(() => setOpenGroup((g) => (g === item.label ? null : g)), 150)}
                className={tabClassName(groupActive)}
              >
                {item.label}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} aria-hidden />
              </button>

              {isOpen && (
                <div className="absolute left-0 top-full z-50 min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-soft-lg">
                  {item.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpenGroup(null)}
                      className={cn(
                        'block px-4 py-2 text-sm transition-colors',
                        matchesPath(pathname, link.href)
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-brand-700'
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
