import { AdminTopBar } from '@/components/layout/AdminTopBar'
import { AdminNav } from '@/components/layout/AdminNav'

// Dédié à /admin : sa propre barre (logo + utilisateur + déconnexion), sans
// le Header/Footer marketing du site public (cf. app/(client)/layout.tsx et
// les layouts frères qui, eux, les conservent).
//
// AdminNav (regroupée en sous-menus) remplace ici l'ancienne liste plate de
// 10 liens portée par NavTabs — devenue difficile à lire. NavTabs.tsx a
// depuis été supprimé (plus aucun consommateur, cf. AdminNav.tsx).
//
// Largeurs des <main> admin (règle relevée par l'audit v3, volontairement
// conservée telle quelle — trois rôles cohérents, pas une incohérence) :
//   max-w-lg  → formulaires seuls (paramètres, création utilisateur)
//   max-w-2xl → files de validation (paiements, retraits, vérifications)
//   max-w-4xl → grandes listes / vues d'ensemble (marketplace, utilisateurs)
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />
      <AdminNav />
      {children}
    </div>
  )
}
