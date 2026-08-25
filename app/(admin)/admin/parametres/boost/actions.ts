'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { boostTierPriceSchema } from '@/lib/validations/settings'

export interface BoostTierFormState {
  error: string | null
  success: boolean
}

// Met à jour le prix d'un seul palier (duration_days fixe, 1-7 — jamais
// modifiable ici, seulement price_tnd). Réservé aux admins
// (RLS boost_pricing_tiers_update_admin_only, déjà en place — cf.
// schema.sql, chantier boost-pricing-tiers) : aucun nouveau souci de
// sécurité à gérer ici, même mécanique que updateCommissionSettings.
export async function updateBoostTierPrice(
  durationDays: number,
  _prevState: BoostTierFormState,
  formData: FormData
): Promise<BoostTierFormState> {
  const parsed = boostTierPriceSchema.safeParse({
    price_tnd: formData.get('price_tnd'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', success: false }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('boost_pricing_tiers')
    .update({
      price_tnd: parsed.data.price_tnd,
      updated_by: user?.id ?? null,
    })
    .eq('duration_days', durationDays)

  if (error) {
    console.error('[admin/parametres/boost] update boost_pricing_tiers a échoué', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      durationDays,
    })
    return { error: 'Impossible d\'enregistrer ce prix, réessaie.', success: false }
  }

  revalidatePath('/admin/parametres/boost')
  return { error: null, success: true }
}
