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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NavTabs links={links} maxWidthClassName="max-w-4xl" />
      {children}
    </div>
  )
}
