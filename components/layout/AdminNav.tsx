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

// Nav admin dédiée, regroupée en sous-menus — remplace l'ancienne liste
// plate de 10 liens portée par NavTabs (composant retiré, plus aucun
// consommateur restant). Section "Commerces" et lien "Commandes" retirés
// avec le rôle commerce ; "Paiements commandes" retiré du groupe Paiements
// pour la même raison (ne reste que le volet Jibli).
const items: NavItem[] = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/demandes', label: 'Demandes' },
  { href: '/admin/marketplace', label: 'Marketplace' },
  { href: '/admin/utilisateurs', label: 'Utilisateurs' },
  { href: '/admin/verifications', label: 'Vérifications' },
  { href: '/admin/litiges', label: 'Litiges' },
  {
    label: 'Paiements',
    links: [
      { href: '/admin/jibli-paiements', label: 'Paiements Jibli' },
      { href: '/admin/boost-paiements', label: 'Paiements Boost' },
      { href: '/admin/portefeuille-paiements', label: 'Dépôts portefeuille' },
      { href: '/admin/retraits', label: 'Retraits' },
      { href: '/admin/flouci-incidents', label: 'Paiements Flouci orphelins' },
    ],
  },
  {
    label: 'Paramètres',
    links: [
      { href: '/admin/parametres', label: "Vue d'ensemble" },
      { href: '/admin/parametres/commission', label: 'Commission' },
      { href: '/admin/parametres/virement', label: 'Virement' },
      { href: '/admin/parametres/liberation-automatique', label: 'Libération automatique' },
      { href: '/admin/parametres/boost', label: 'Boost' },
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
      {/* PAS de overflow-x-auto ici : sur cet axe, le CSS force overflow-y à
          passer de "visible" à "auto" dès que overflow-x n'est pas
          "visible" — ça rognait les menus déroulants absolus qui dépassent
          sous la barre (régression constatée après coup : les dropdowns
          "s'ouvraient" mais restaient invisibles/incliquables). Les entrées
          de premier niveau tiennent sans scroll horizontal, contrairement à
          l'ancienne liste à plat de 10 liens. */}
      <div className="mx-auto flex max-w-4xl flex-wrap gap-1 px-4">
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
