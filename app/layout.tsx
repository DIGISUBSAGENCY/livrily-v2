import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { GoogleMapsProvider } from '@/components/maps/GoogleMapsProvider'
import { OneSignalInit } from '@/components/notifications/OneSignalInit'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site'
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

// metadataBase DOIT pointer vers le vrai domaine en prod pour que les
// images Open Graph se résolvent correctement dans les prévisualisations
// (WhatsApp, Facebook...). getSiteUrl() (lib/site.ts) retombe désormais sur
// le vrai domaine de prod si NEXT_PUBLIC_SITE_URL manque — avant, ce
// fichier omettait volontairement metadataBase dans ce cas (pour que
// l'oubli soit visible), ce qui cassait silencieusement la résolution des
// images OG plutôt que de rediriger vers localhost comme le reste du code.
// Les deux comportements étaient de mauvais fallbacks pour des raisons
// différentes ; un seul fallback correct et centralisé règle les deux.
const siteUrl = getSiteUrl()

const title = 'Livrily — Crowd-shipping en Tunisie'
const description =
  "Fais-toi ramener un objet de l'étranger par un voyageur, ou rentabilise ton prochain voyage en le ramenant toi-même. Paiement sécurisé, en séquestre jusqu'à réception."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
        <GoogleMapsProvider>{children}</GoogleMapsProvider>
        <OneSignalInit userId={user?.id ?? null} />
      </body>
    </html>
  )
}
