import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/Button'
import { CartLink } from '@/components/cart/CartLink'
import { MobileNav } from '@/components/layout/MobileNav'

// Server Component : lit la session une fois par requête et affiche la nav
// adaptée au rôle. La déconnexion passe par une Server Action (formulaire),
// pas par un appel Supabase direct côté client.
export async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  let role: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()
    displayName = profile?.full_name ?? user.email ?? null
    role = profile?.role ?? null
  }

  // Le panier et le crowd-shipping n'ont de sens que côté client (invité ou
  // compte "client") : un compte commerce/admin ne fait pas d'achats sur la
  // plateforme.
  const showCart = !user || role === 'client'
  const showJibli = !user || role === 'client'

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-700">
          Livrily
        </Link>

        <div className="flex items-center gap-2">
          {showJibli && (
            <Link
              href="/jibli"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700 sm:inline-block"
            >
              Voyages
            </Link>
          )}
          <Link
            href="/comment-ca-marche"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700 sm:inline-block"
          >
            Comment ça marche
          </Link>
          {role === 'client' && (
            <Link
              href="/parrainage"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700 sm:inline-block"
            >
              Parrainage
            </Link>
          )}
          {showCart && <CartLink />}

          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">{displayName}</span>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm">
                  <LogOut className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Déconnexion</span>
                </Button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Connexion
                </Button>
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="sm">
                  Créer un compte
                </Button>
              </Link>
            </div>
          )}

          <MobileNav
            showJibli={showJibli}
            showParrainage={role === 'client'}
            isLoggedIn={!!user}
            displayName={displayName}
          />
        </div>
      </div>
    </header>
  )
}
