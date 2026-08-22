'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { verifyTotpFactor } from '@/lib/mfa'

export async function verifyAdminMfaChallenge(
  factorId: string,
  code: string,
  next: string | undefined
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const result = await verifyTotpFactor(supabase, factorId, code)
  if (result.error) return result

  redirect(next && next.startsWith('/admin') ? next : '/admin')
}
