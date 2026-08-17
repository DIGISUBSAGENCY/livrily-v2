import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { Card } from '@/components/ui/Card'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Connexion admin',
  description: 'Connexion réservée aux administrateurs Livrily.',
  noIndex: true,
})

interface AdminLoginPageProps {
  searchParams: Promise<{ next?: string; reset?: string }>
}

// Route dédiée, isolée dans son propre groupe (app/(admin-auth)/admin/login)
// pour ne PAS hériter du chrome du dashboard (AdminTopBar + NavTabs, cf.
// app/(admin)/admin/layout.tsx) ni du Header/Footer public — page volontai-
// rement nue, sans navigation.
export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { next, reset } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Déjà connecté en tant qu'admin : inutile de réafficher le formulaire.
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role === 'admin') {
      redirect(next && next.startsWith('/admin') ? next : '/admin')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-lg font-bold tracking-tight text-white">
            Livrily{' '}
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              Admin
            </span>
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Connexion administrateur</h1>
          <p className="mt-1 text-sm text-slate-400">Accès réservé aux comptes administrateur.</p>
        </div>
        {reset === 'success' && (
          <p className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/50 p-3 text-center text-sm text-emerald-300">
            Mot de passe mis à jour. Connecte-toi avec ton nouveau mot de passe.
          </p>
        )}
        <Card>
          <AdminLoginForm next={next} />
        </Card>
      </div>
    </div>
  )
}
