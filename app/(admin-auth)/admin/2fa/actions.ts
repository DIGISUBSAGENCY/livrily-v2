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
// `next` est capturé par closure côté page.tsx (bound server action, même
// pattern que ResolutionForm onResolve={(note) => resolveDispute(id, note)}).
export async function verifyAdminMfaEnrollment(
  factorId: string,
  code: string,
  next: string | undefined
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const result = await verifyTotpFactor(supabase, factorId, code)
  if (result.error) return result

  redirect(next && next.startsWith('/admin') ? next : '/admin')
}
