// Logique partagée du middleware : rafraîchit la session Supabase sur
// chaque requête (indispensable avec @supabase/ssr en Server Components,
// sans quoi les cookies de session expirent silencieusement), puis protège
// les routes /commerce/* et /admin/* selon le rôle stocké dans `profiles`.
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
  // startsWith('/commerce') matcherait aussi /commerces (la page publique de
  // liste des commerces) puisque "commerces" contient "commerce" comme
  // sous-chaîne — d'où la vérification de frontière de segment ci-dessous.
  const isCommerceRoute = pathname === '/commerce' || pathname.startsWith('/commerce/')
  // /admin/login est exclue du garde-fou ci-dessous : elle vit dans son propre
  // groupe de routes (app/(admin-auth)/admin/login), sans passer par le
  // dashboard admin — mais le préfixe /admin/ la matcherait quand même sans
  // cette exception, provoquant une boucle de redirection infinie pour un
  // visiteur non connecté.
  const isAdminLoginRoute = pathname === '/admin/login'
  const isAdminRoute = !isAdminLoginRoute && (pathname === '/admin' || pathname.startsWith('/admin/'))
  const loginPath = isAdminRoute ? '/admin/login' : '/login'

  if (isCommerceRoute || isAdminRoute) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = loginPath
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
      url.pathname = loginPath
      return NextResponse.redirect(url)
    }

    if (isCommerceRoute && profile.role !== 'commerce') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    if (isAdminRoute && profile.role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
