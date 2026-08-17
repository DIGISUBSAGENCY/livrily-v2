import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/server'
import type { Database, UserRole } from '@/types/database'

const REFERRAL_COOKIE = 'jibli_referral_code'

function roleHome(role: UserRole): string {
  if (role === 'commerce') return '/commerce'
  if (role === 'admin') return '/admin'
  return '/'
}

// Échange le code de confirmation email (ou OAuth — Google notamment,
// components/auth/GoogleSignInButton.tsx) contre une session, puis redirige
// vers la complétion de profil si nécessaire, sinon vers l'espace
// correspondant au rôle de l'utilisateur.
//
// ⚠️ Ne PAS utiliser lib/supabase/server.ts::createClient() ici (comme
// avant ce correctif). Ce client générique écrit les cookies via
// next/headers cookies() — conçu pour les Server Components/Actions, où
// Next.js relie cette écriture à SA réponse implicite. Un Route Handler qui
// retourne son propre NextResponse.redirect(), comme celui-ci, court-circuite
// ce lien : les cookies de session posés par exchangeCodeForSession()
// n'atterrissaient jamais sur la réponse réellement envoyée au navigateur.
// Symptôme exact du bug rapporté : la session existait bien le temps de cet
// appel (exchangeCodeForSession réussit, la lecture de profil qui suit
// fonctionne, donc aucune erreur nulle part) mais le navigateur ne recevait
// aucun cookie `sb-...-auth-token` — la requête suivante (page de
// destination) se retrouvait donc sans session, et /profil/completer (ou le
// middleware pour /commerce, /admin) renvoyait vers /login.
//
// Correctif : on construit un client Supabase dédié à CETTE requête, dont
// setAll() accumule les cookies au lieu de les écrire tout de suite, puis on
// les rejoue sur LA réponse finale une fois la destination connue — c'est le
// pattern documenté par Supabase pour un callback OAuth en Route Handler
// (voir https://supabase.com/docs/guides/auth/server-side/nextjs).
// Supabase (GoTrue) redirige parfois directement vers ce callback avec un
// `error`/`error_description` au lieu d'un `code` — typiquement quand
// l'échange de code externe échoue de son côté (ex: Client Secret Google
// invalide), avant même que ce Route Handler n'ait la main sur quoi que ce
// soit. Sans ce log/relais, l'échec était invisible (redirigé vers un
// message générique "confirmation_echouee" qui masquait la vraie cause).
function logAndBuildErrorRedirect(origin: string, reason: string): NextResponse {
  console.error(`[auth/callback] Échec de connexion : ${reason}`)
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`)
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const upstreamError = searchParams.get('error_description') ?? searchParams.get('error')

  if (upstreamError) {
    return logAndBuildErrorRedirect(origin, upstreamError)
  }

  if (code) {
    const cookiesToApply: { name: string; value: string; options: CookieOptions }[] = []

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(toSet) {
            cookiesToApply.push(...toSet)
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error || !data.user) {
      return logAndBuildErrorRedirect(origin, error?.message ?? 'echange_session_echoue')
    }

    // Flux de récupération de mot de passe (ex: /admin/forgot-password) : on
    // redirige directement vers `next` sans passer par la logique de
    // complétion de profil / rôle ci-dessous — la session est bien établie
    // (les cookies sont posés plus bas comme pour tout autre échange), mais
    // l'utilisateur doit d'abord définir un nouveau mot de passe avant
    // d'atterrir sur son espace habituel.
    if (next?.startsWith('/admin/reset-password')) {
      const response = NextResponse.redirect(`${origin}${next}`)
      cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      return response
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, phone, address, referred_by')
      .eq('id', data.user.id)
      .single()

    // Parrainage via Google : signInWithOAuth() ne permet pas de faire
    // passer referral_code_used comme le fait auth.signUp() (cf.
    // GoogleSignInButton) — rattrapé ici depuis un cookie déposé juste avant
    // la redirection vers Google. Client admin obligatoire :
    // profiles.referred_by est protégé par prevent_wallet_self_edit
    // (schema.sql) contre une auto-modification, y compris la nôtre ici
    // (même session que l'utilisateur qui vient de se créer).
    const referralCode = request.cookies.get(REFERRAL_COOKIE)?.value
    if (referralCode && profile && !profile.referred_by) {
      const adminClient = createAdminClient()
      const { data: referrer } = await adminClient
        .from('profiles')
        .select('id')
        .eq('referral_code', referralCode.toUpperCase())
        .maybeSingle()

      if (referrer && referrer.id !== data.user.id) {
        await adminClient.from('profiles').update({ referred_by: referrer.id }).eq('id', data.user.id)
      }
    }

    const profileComplete = Boolean(profile?.full_name && profile?.phone && profile?.address)
    const destination = profileComplete ? roleHome(profile!.role) : '/profil/completer'

    const response = NextResponse.redirect(`${origin}${destination}`)
    cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    response.cookies.delete(REFERRAL_COOKIE)
    return response
  }

  return logAndBuildErrorRedirect(origin, 'aucun_code_recu')
}
