// Client Supabase pour Server Components, Server Actions et Route Handlers.
// Lié aux cookies de la requête : les appels s'exécutent avec la session de
// l'utilisateur connecté (donc toujours filtrés par RLS), pas avec des
// privilèges élevés — voir createAdminClient() ci-dessous pour l'exception
// explicite et volontaire (opérations admin qui doivent contourner RLS).
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // setAll appelé depuis un Server Component (pas une Server Action /
            // Route Handler) : Next.js interdit l'écriture de cookies ici.
            // Sans conséquence tant que le middleware rafraîchit la session.
          }
        },
      },
    }
  )
}

// Client "admin" — utilise la clé service_role, qui CONTOURNE toutes les
// policies RLS. Réservé aux Server Actions/Route Handlers qui implémentent
// explicitement une opération administrative déjà autorisée par un contrôle
// de rôle applicatif (ex: validation d'un paiement virement par un admin).
// Ne jamais utiliser ce client pour relayer une requête basée sur l'input
// utilisateur sans avoir vérifié le rôle en amont.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
