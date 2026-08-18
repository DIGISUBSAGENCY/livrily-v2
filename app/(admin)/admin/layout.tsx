import { AdminTopBar } from '@/components/layout/AdminTopBar'
import { AdminNav } from '@/components/layout/AdminNav'

// Dédié à /admin : sa propre barre (logo + utilisateur + déconnexion), sans
// le Header/Footer marketing du site public (cf. app/(client)/layout.tsx et
// les layouts frères qui, eux, les conservent).
//
// AdminNav (regroupée en sous-menus) remplace ici l'ancienne liste plate de
// 10 liens portée par NavTabs — devenue difficile à lire. NavTabs reste
// utilisé tel quel par /commerce (components/layout/AdminNav.tsx explique
// pourquoi ce n'est pas le composant partagé qui a été modifié).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />
      <AdminNav />
      {children}
    </div>
  )
}
