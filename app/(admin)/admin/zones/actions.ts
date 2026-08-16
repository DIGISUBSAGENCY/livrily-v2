'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { zoneSchema, surgeRuleSchema } from '@/lib/validations/zone'

export interface ZoneFormState {
  error: string | null
}

export interface ActionResult {
  error: string | null
}

function parseZoneForm(formData: FormData) {
  return zoneSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city') || undefined,
    center_lat: formData.get('center_lat'),
    center_lng: formData.get('center_lng'),
    radius_meters: formData.get('radius_meters'),
    delivery_fee: formData.get('delivery_fee'),
    fee_per_km: formData.get('fee_per_km'),
    min_order_amount: formData.get('min_order_amount'),
    is_active: formData.get('is_active') === 'on',
  })
}

export async function createZone(_prev: ZoneFormState, formData: FormData): Promise<ZoneFormState> {
  const parsed = parseZoneForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('delivery_zones').insert(parsed.data)

  if (error) {
    return { error: 'Impossible de créer la zone, réessaie.' }
  }

  revalidatePath('/admin/zones')
  redirect('/admin/zones')
}

export async function updateZone(
  zoneId: string,
  _prev: ZoneFormState,
  formData: FormData
): Promise<ZoneFormState> {
  const parsed = parseZoneForm(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('delivery_zones').update(parsed.data).eq('id', zoneId)

  if (error) {
    return { error: 'Impossible de mettre à jour la zone, réessaie.' }
  }

  revalidatePath('/admin/zones')
  redirect('/admin/zones')
}

export async function toggleZoneActive(zoneId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('delivery_zones').update({ is_active: isActive }).eq('id', zoneId)

  if (error) return { error: 'Impossible de mettre à jour la zone.' }

  revalidatePath('/admin/zones')
  return { error: null }
}

export async function deleteZone(zoneId: string): Promise<ActionResult> {
  const supabase = await createClient()

  // commerces.zone_id est en "on delete set null" (pas restrict) : sans ce
  // contrôle explicite, supprimer une zone encore utilisée mettrait
  // silencieusement zone_id à null sur les commerces concernés — cassant
  // leur checkout sans le moindre avertissement. Vérifié à la main ici
  // (découvert en testant : la suppression réussissait sans erreur alors
  // qu'un commerce dépendait encore de la zone).
  const { count } = await supabase
    .from('commerces')
    .select('id', { count: 'exact', head: true })
    .eq('zone_id', zoneId)

  if (count && count > 0) {
    return {
      error: `Impossible de supprimer : ${count} commerce${count > 1 ? 's utilisent' : ' utilise'} encore cette zone. Réassigne-le${count > 1 ? 's' : ''} d'abord, ou désactive la zone plutôt.`,
    }
  }

  const { error } = await supabase.from('delivery_zones').delete().eq('id', zoneId)

  if (error) {
    // orders.zone_id, lui, est en restrict par défaut : reste possible.
    return { error: 'Impossible de supprimer cette zone (des commandes y font encore référence). Désactive-la plutôt.' }
  }

  revalidatePath('/admin/zones')
  return { error: null }
}

// Phase 5 — Module 5 : règles de majoration heure de pointe (zone_surge_rules).
export interface SurgeRuleFormState {
  error: string | null
}

export async function createSurgeRule(
  zoneId: string,
  _prev: SurgeRuleFormState,
  formData: FormData
): Promise<SurgeRuleFormState> {
  const parsed = surgeRuleSchema.safeParse({
    label: formData.get('label'),
    days_of_week: formData.getAll('days_of_week'),
    start_time: formData.get('start_time'),
    end_time: formData.get('end_time'),
    multiplier: formData.get('multiplier'),
    is_active: true,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('zone_surge_rules').insert({ ...parsed.data, zone_id: zoneId })

  if (error) {
    return { error: 'Impossible de créer cette règle, réessaie.' }
  }

  revalidatePath(`/admin/zones/${zoneId}`)
  return { error: null }
}

export async function toggleSurgeRuleActive(zoneId: string, ruleId: string, isActive: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('zone_surge_rules').update({ is_active: isActive }).eq('id', ruleId)

  if (error) return { error: 'Impossible de mettre à jour cette règle.' }

  revalidatePath(`/admin/zones/${zoneId}`)
  return { error: null }
}

export async function deleteSurgeRule(zoneId: string, ruleId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('zone_surge_rules').delete().eq('id', ruleId)

  if (error) return { error: 'Impossible de supprimer cette règle.' }

  revalidatePath(`/admin/zones/${zoneId}`)
  return { error: null }
}
