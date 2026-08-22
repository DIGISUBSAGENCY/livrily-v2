'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { verifyTotpFactor } from '@/lib/mfa'

// `next` en premier paramètre pour permettre verifyAdminMfaChallenge.bind(null, next)
// côté page plutôt qu'une closure — voir le commentaire détaillé sur
// verifyAdminMfaEnrollment (../actions.ts), même raison exacte (frontière RSC).
export async function verifyAdminMfaChallenge(
  next: string | undefined,
  factorId: string,
  code: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const result = await verifyTotpFactor(supabase, factorId, code)
  if (result.error) return result

  redirect(next && next.startsWith('/admin') ? next : '/admin')
}
