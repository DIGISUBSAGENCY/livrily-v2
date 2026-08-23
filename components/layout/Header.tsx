import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { MobileNav } from '@/components/layout/MobileNav'
import { UserMenu } from '@/components/layout/UserMenu'
import { NotificationBell } from '@/components/notifications/NotificationBell'

// Server Component : lit la session une fois par requête et affiche la nav
// adaptée au rôle. La déconnexion passe par une Server Action (formulaire),
// pas par un appel Supabase direct côté client.
export async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let fullName: string | null = null
  let displayName: string | null = null
  let role: string | null = null
  let unreadNotificationCount = 0
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()
    fullName = profile?.full_name ?? null
    displayName = fullName ?? user.email ?? null
    role = profile?.role ?? null

    // Compteur seulement ici (pas la liste complète) : coût d'une requête
    // count(*) supplémentaire, la liste elle-même n'est chargée qu'à
    // l'ouverture du dropdown (NotificationBell), pas à chaque page.
    const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).is('read_at', null)
    unreadNotificationCount = count ?? 0
  }

  // Le crowd-shipping n'a de sens que côté client (invité ou compte
  // "client") : un compte admin ne publie/propose pas sur la plateforme.
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
          {showJibli && (
            <Link
              href="/jibli/trips"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700 sm:inline-block"
            >
              Trips
            </Link>
          )}
          {showJibli && (
            <Link
              href="/jibli/offres"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700 sm:inline-block"
            >
              Offres
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
          {user ? (
            <>
              {/*
                Visible mobile + desktop (contrairement à UserMenu) : une
                liste de notifications n'a pas sa place dans MobileNav (menu
                plein écran, état d'ouverture distinct) — icône autonome.
              */}
              <NotificationBell initialUnreadCount={unreadNotificationCount} />
              <div className="hidden sm:block">
                <UserMenu fullName={fullName} email={user.email ?? null} />
              </div>
            </>
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
