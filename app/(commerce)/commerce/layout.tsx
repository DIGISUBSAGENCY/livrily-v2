import { NavTabs } from '@/components/layout/NavTabs'

const links = [
  { href: '/commerce', label: 'Tableau de bord' },
  { href: '/commerce/commandes', label: 'Commandes' },
  { href: '/commerce/produits', label: 'Catalogue' },
  { href: '/commerce/equipe', label: 'Équipe' },
]

export default function CommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <NavTabs links={links} maxWidthClassName="max-w-3xl" />
      {children}
    </div>
  )
}
