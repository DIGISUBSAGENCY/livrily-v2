// Logique partagée du middleware : rafraîchit la session Supabase sur
// chaque requête (indispensable avec @supabase/ssr en Server Components,
// sans quoi les cookies de session expirent silencieusement), puis protège
// les routes /admin/* selon le rôle stocké dans `profiles`.
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT : ne pas retirer cet appel. Il rafraîchit le token si besoin
  // et c'est ce qui déclenche l'écriture des cookies mis à jour ci-dessus.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  // /admin/login, /admin/forgot-password et /admin/reset-password sont
  // exclues du garde-fou ci-dessous : elles vivent dans leur propre groupe
  // de routes (app/(admin-auth)/admin/...), sans passer par le dashboard
  // admin, et doivent rester accessibles à un visiteur NON connecté. C'était
  // déjà le cas pour login/forgot-password ; /admin/reset-password l'a
  // rejoint depuis le passage à la vérification par code OTP (au lieu d'un
  // lien cliquable, vulnérable au click-tracking automatique de la chaîne
  // d'envoi) — l'admin n'a plus de session de récupération pré-établie en
  // arrivant sur cette page (aucun /auth/callback ne s'exécute avant), la
  // session n'existe qu'une fois le code soumis via verifyOtp() dans son
  // Server Action. La exiger ici bloquerait l'accès à la page elle-même.
  const isPublicAdminAuthRoute =
    pathname === '/admin/login' || pathname === '/admin/forgot-password' || pathname === '/admin/reset-password'
  const isAdminRoute = !isPublicAdminAuthRoute && (pathname === '/admin' || pathname.startsWith('/admin/'))

  if (isAdminRoute) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (error || !profile || !profile.is_active) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }

    if (profile.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
