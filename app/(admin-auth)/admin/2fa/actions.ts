'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { enrollTotpFactor, verifyTotpFactor, type MfaEnrollResult } from '@/lib/mfa'

export async function enrollAdminMfaFactor(): Promise<MfaEnrollResult> {
  const supabase = await createClient()
  return enrollTotpFactor(supabase)
}

// La redirection est faite ICI (dans le Server Action), pas dans le
// composant client appelant — cf. le même choix pour signIn/adminSignIn.
//
// `next` en PREMIER paramètre (pas en dernier) : permet à la page de le
// fixer via verifyAdminMfaEnrollment.bind(null, next) plutôt qu'une arrow
// function — une closure ordinaire ('(factorId, code) => verifyAdmin...
// (factorId, code, next)') n'est PAS une référence server action valide
// pour la frontière RSC ("Functions cannot be passed directly to Client
// Components..."), même si elle n'appelle qu'un vrai 'use server' dans son
// corps. Seule une vraie référence (ou son .bind()) la traverse — .bind()
// ne peut fixer que les paramètres de TÊTE, d'où cet ordre. Bug reproduit
// en direct (500 sur cette page précise) avant ce correctif.
export async function verifyAdminMfaEnrollment(
  next: string | undefined,
  factorId: string,
  code: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const result = await verifyTotpFactor(supabase, factorId, code)
  if (result.error) return result

  redirect(next && next.startsWith('/admin') ? next : '/admin')
}
