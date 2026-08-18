'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X, LogOut } from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/Button'

interface MobileNavProps {
  showJibli: boolean
  showParrainage: boolean
  isLoggedIn: boolean
  displayName: string | null
}

// Visible uniquement < sm (le bouton burger lui-même est `sm:hidden`) —
// sur desktop, Header.tsx affiche déjà ces liens directement. Avant ce
// composant, "Voyages"/"Parrainage" étaient simplement `hidden` sur mobile
// (cf. Header.tsx), sans aucun moyen d'y accéder — pas un menu à
// "simplifier", un menu à construire.
export function MobileNav({ showJibli, showParrainage, isLoggedIn, displayName }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
        aria-label={isOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
      >
        {isOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {isOpen && (
        <div className="absolute inset-x-0 top-16 z-40 border-b border-slate-200 bg-white shadow-soft-lg">
          <nav className="flex flex-col px-4 py-2">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Accueil
            </Link>
            {showJibli && (
              <Link
                href="/jibli"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voyages
              </Link>
            )}
            <Link
              href="/comment-ca-marche"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Comment ça marche
            </Link>
            {showParrainage && (
              <Link
                href="/parrainage"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Parrainage
              </Link>
            )}

            <div className="mt-2 border-t border-slate-100 pt-2">
              {isLoggedIn ? (
                <div className="flex items-center justify-between px-3 py-2">
                  {displayName && <span className="truncate text-sm text-slate-600">{displayName}</span>}
                  <form action={signOut}>
                    <Button type="submit" variant="ghost" size="sm">
                      <LogOut className="h-4 w-4" aria-hidden />
                      Déconnexion
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-3 py-2">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button variant="secondary" size="sm" className="w-full">
                      Connexion
                    </Button>
                  </Link>
                  <Link href="/signup" onClick={() => setIsOpen(false)}>
                    <Button variant="primary" size="sm" className="w-full">
                      Créer un compte
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
