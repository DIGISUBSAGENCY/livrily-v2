import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { GoogleMapsProvider } from '@/components/maps/GoogleMapsProvider'
import { CartProvider } from '@/lib/cart/CartContext'
import { OneSignalInit } from '@/components/notifications/OneSignalInit'
import { createClient } from '@/lib/supabase/server'
import './globals.css'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})

// process.env directement (pas de fallback localhost ici, contrairement au
// reste du code) : metadataBase DOIT pointer vers le vrai domaine en prod
// pour que les images Open Graph se résolvent correctement dans les
// prévisualisations (WhatsApp, Facebook...) — un oubli de variable d'env
// doit se voir plutôt que retomber silencieusement sur localhost.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL

const title = 'Livrily — Livraison à la demande en Tunisie'
const description =
  'Courses, supermarché, boulangerie et fruits & légumes livrés chez toi. Fais-toi aussi ramener un objet de l\'étranger par un voyageur, paiement sécurisé.'

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  title: { default: title, template: '%s | Livrily' },
  description,
  openGraph: {
    type: 'website',
    locale: 'fr_TN',
    siteName: 'Livrily',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 antialiased`}
      >
        <GoogleMapsProvider>
          <CartProvider>{children}</CartProvider>
        </GoogleMapsProvider>
        <OneSignalInit userId={user?.id ?? null} />
      </body>
    </html>
  )
}
