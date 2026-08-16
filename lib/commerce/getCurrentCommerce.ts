import { createClient } from '@/lib/supabase/server'
import type { Commerce } from '@/types/database'

// Résout le commerce géré par l'utilisateur connecté (commerces.owner_id).
// Retourne null si l'utilisateur n'a pas (ou pas encore) de fiche commerce
// associée — cas d'un compte role='commerce' promu par l'admin avant que
// commerces.owner_id n'ait été renseigné.
export async function getCurrentCommerce(): Promise<Commerce | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: commerce } = await supabase.from('commerces').select('*').eq('owner_id', user.id).maybeSingle()

  return commerce ?? null
}
