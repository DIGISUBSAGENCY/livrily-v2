import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

// /commerce/* : conserve le chrome public au-dessus du sous-layout à onglets
// (app/(commerce)/commerce/layout.tsx) — comportement inchangé par le
// découpage du root layout, seul /admin en est exclu (cf. app/(client)/layout.tsx).
export default function CommerceGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
