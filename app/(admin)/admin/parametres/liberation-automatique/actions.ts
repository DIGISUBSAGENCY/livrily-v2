'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { autoReleaseSettingsSchema } from '@/lib/validations/settings'

export interface AutoReleaseFormState {
  error: string | null
  success: boolean
}

// Même pattern que updateCommissionSettings (commission/actions.ts) : met
// à jour l'unique ligne de platform_settings (id = true), réservé aux
// admins (RLS platform_settings_update_admin_only).
export async function updateAutoReleaseSettings(
  _prevState: AutoReleaseFormState,
  formData: FormData
): Promise<AutoReleaseFormState> {
  const parsed = autoReleaseSettingsSchema.safeParse({
    auto_release_delay_days: formData.get('auto_release_delay_days'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', success: false }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('platform_settings')
    .update({
      auto_release_delay_days: parsed.data.auto_release_delay_days,
      updated_by: user?.id ?? null,
    })
    .eq('id', true)

  if (error) {
    console.error('[admin/parametres/liberation-automatique] update platform_settings a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: "Impossible d'enregistrer le délai, réessaie.", success: false }
  }

  revalidatePath('/admin/parametres/liberation-automatique')
  return { error: null, success: true }
}
