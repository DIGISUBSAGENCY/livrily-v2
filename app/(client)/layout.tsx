import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

// Chrome public (marketing) : homepage, commerces, jibli, checkout,
// commandes, parrainage, pages légales. Anciennement porté par le root
// layout — déplacé ici pour pouvoir en exclure /admin (et /commerce) sans
// dupliquer <html>/<body> (cf. app/(admin)/admin/layout.tsx).
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
