import { AdminTopBar } from '@/components/layout/AdminTopBar'
import { NavTabs } from '@/components/layout/NavTabs'

const links = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/commandes', label: 'Commandes' },
  { href: '/admin/commerces', label: 'Commerces' },
  { href: '/admin/zones', label: 'Zones' },
  { href: '/admin/comptes-commerce', label: 'Comptes commerce' },
  { href: '/admin/paiements', label: 'Paiements commandes' },
  { href: '/admin/jibli-paiements', label: 'Paiements Jibli' },
  { href: '/admin/parametres/virement', label: 'Virement' },
]

// Dédié à /admin : sa propre barre (logo + utilisateur + déconnexion), sans
// le Header/Footer marketing du site public (cf. app/(client)/layout.tsx et
// les layouts frères qui, eux, les conservent).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminTopBar />
      <NavTabs links={links} maxWidthClassName="max-w-4xl" />
      {children}
    </div>
  )
}
