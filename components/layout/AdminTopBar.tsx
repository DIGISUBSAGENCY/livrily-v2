import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/Button'

// Barre du tableau de bord admin : volontairement distincte du Header public
// (fond sombre, pas de panier/voyages/parrainage) pour qu'un admin ne
// confonde jamais /admin avec le site marketing. Server Component, même
// pattern que Header (lecture de session une fois par requête).
export async function AdminTopBar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    displayName = profile?.full_name ?? user.email ?? null
  }

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900">
      <div className="mx-auto flex h-full max-w-4xl items-center justify-between px-4">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-white">Livrily</span>
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            Admin
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {displayName && <span className="hidden text-sm text-slate-300 sm:inline">{displayName}</span>}
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
