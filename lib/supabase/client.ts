// Client Supabase pour les Client Components (navigateur).
// Utilise uniquement la clé anonyme publique : toute lecture/écriture passe
// par les policies RLS de l'utilisateur connecté, jamais de privilèges élevés ici.
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
