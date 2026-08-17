import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'

// /login, /signup : même chrome public que le reste du site (cf.
// app/(client)/layout.tsx pour le contexte de ce découpage).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
