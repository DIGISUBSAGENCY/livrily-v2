'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Marque le tour guidé comme vu — appelé depuis OnboardingTour (Passer ou
// dernière étape). profiles.onboarding_seen_at : null tant que jamais vu.
export async function markOnboardingSeen(): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('[jibli] markOnboardingSeen a échoué', { message: error.message, code: error.code })
    return { error: 'Impossible de mettre à jour, réessaie.' }
  }

  revalidatePath('/jibli')
  return { error: null }
}
