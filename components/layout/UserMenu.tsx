'use client'

import { useState } from 'react'
import Link from 'next/link'
import { User, ClipboardList, Settings, AlertTriangle, LogOut } from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'

interface UserMenuProps {
  fullName: string | null
  email: string | null
}

const menuItems = [
  { href: '/profil', label: 'Mon profil', icon: User },
  { href: '/profil/parametres', label: 'Paramètres du compte', icon: Settings },
  { href: '/commandes', label: 'Mon activité', icon: ClipboardList },
  { href: '/profil/litiges', label: 'Mes litiges', icon: AlertTriangle },
]

function getInitial(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

// Même pattern d'ouverture/fermeture que AdminNav.tsx (bouton + onBlur
// différé plutôt qu'un listener de clic extérieur) — déjà éprouvé dans ce
// projet, y compris le correctif overflow-x-auto qui rognait les dropdowns
// absolus.
export function UserMenu({ fullName, email }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const initial = getInitial(fullName, email)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        aria-label="Menu du compte"
        aria-expanded={isOpen}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {initial}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white py-2 shadow-soft-lg">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{fullName ?? 'Utilisateur'}</p>
              {email && <p className="truncate text-xs text-slate-500">{email}</p>}
            </div>
          </div>

          <div className="my-1 border-t border-slate-100" />

          <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Mon compte</p>
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-brand-700"
            >
              <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden />
              {item.label}
            </Link>
          ))}

          <div className="my-1 border-t border-slate-100" />

          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden />
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
