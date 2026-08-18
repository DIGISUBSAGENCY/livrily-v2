'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { commissionSettingsSchema } from '@/lib/validations/settings'

export interface CommissionFormState {
  error: string | null
  success: boolean
}

// Met à jour l'unique ligne de platform_settings (id = true, singleton —
// cf. schema.sql). Réservé aux admins (RLS platform_settings_update_admin_only).
export async function updateCommissionSettings(
  _prevState: CommissionFormState,
  formData: FormData
): Promise<CommissionFormState> {
  const parsed = commissionSettingsSchema.safeParse({
    travel_commission_rate: formData.get('travel_commission_rate'),
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
      travel_commission_rate: parsed.data.travel_commission_rate,
      updated_by: user?.id ?? null,
    })
    .eq('id', true)

  if (error) {
    console.error('[admin/parametres/commission] update platform_settings a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    return { error: "Impossible d'enregistrer le taux de commission, réessaie.", success: false }
  }

  revalidatePath('/admin/parametres/commission')
  return { error: null, success: true }
}
