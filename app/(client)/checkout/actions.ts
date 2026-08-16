'use server'

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkoutSchema } from '@/lib/validations/checkout'
import { haversineDistanceMeters } from '@/lib/geo'
import { calculateDeliveryFee, type DeliveryFeeResult } from '@/lib/pricing/deliveryFee'
import { notifyCommerceNewOrder } from '@/lib/notifications/orderNotifications'

export interface CheckoutFormState {
  error: string | null
  orderId?: string
}

export interface DeliveryFeeEstimate {
  error: string | null
  fee?: number
  distanceKm?: number
}

interface ResolvedZoneFee {
  error: string | null
  commerceId?: string
  zoneId?: string
  minOrderAmount?: number
  feeResult?: DeliveryFeeResult
}

// Partagé entre placeOrder (autoritaire) et estimateDeliveryFee (aperçu
// live côté panier) : résout le commerce/la zone, vérifie l'éligibilité de
// l'adresse et calcule le tarif — c'est TOUJOURS ce calcul serveur qui fait
// autorité, jamais une estimation faite côté navigateur.
async function resolveZoneFee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  commerceId: string,
  destination: { lat: number; lng: number }
): Promise<ResolvedZoneFee> {
  const { data: commerce, error: commerceError } = await supabase
    .from('commerces')
    .select('id, is_active, is_open, zone_id, lat, lng')
    .eq('id', commerceId)
    .single()

  if (commerceError || !commerce || !commerce.is_active) {
    return { error: "Ce commerce n'est plus disponible." }
  }
  if (!commerce.is_open) {
    return { error: 'Ce commerce est actuellement fermé et ne peut pas recevoir de commande.' }
  }
  if (!commerce.zone_id) {
    return { error: "Ce commerce n'est pas encore configuré pour la livraison." }
  }
  if (commerce.lat == null || commerce.lng == null) {
    return { error: "Ce commerce n'a pas encore d'adresse géolocalisée." }
  }

  const { data: zone, error: zoneError } = await supabase
    .from('delivery_zones')
    .select('id, center_lat, center_lng, radius_meters, delivery_fee, fee_per_km, min_order_amount, is_active')
    .eq('id', commerce.zone_id)
    .single()

  if (zoneError || !zone || !zone.is_active) {
    return { error: 'Zone de livraison indisponible pour ce commerce.' }
  }

  const distanceFromZoneCenter = haversineDistanceMeters(destination, { lat: zone.center_lat, lng: zone.center_lng })
  if (distanceFromZoneCenter > zone.radius_meters) {
    return { error: "Cette adresse est en dehors de la zone de livraison de ce commerce." }
  }

  // Majorations heure de pointe : lues via le client admin (RLS
  // admin-only sur zone_surge_rules, cf. schema.sql) — jamais exposées
  // telles quelles au client, seul le tarif final l'est.
  const adminClient = createAdminClient()
  const { data: surgeRules } = await adminClient
    .from('zone_surge_rules')
    .select('days_of_week, start_time, end_time, multiplier')
    .eq('zone_id', zone.id)
    .eq('is_active', true)

  const feeResult = calculateDeliveryFee({
    commerceOrigin: { lat: commerce.lat, lng: commerce.lng },
    destination,
    baseFee: zone.delivery_fee,
    feePerKm: zone.fee_per_km,
    surgeRules: surgeRules ?? [],
  })

  return { error: null, commerceId: commerce.id, zoneId: zone.id, minOrderAmount: zone.min_order_amount, feeResult }
}

// Estimation live affichée au checkout dès qu'une adresse est sélectionnée
// (avant validation) — même calcul que placeOrder, juste sans créer de
// commande. Ne fait pas foi : placeOrder recalcule tout de zéro à la
// validation (l'utilisateur peut prendre son temps entre les deux).
export async function estimateDeliveryFee(
  commerceId: string,
  lat: number,
  lng: number
): Promise<DeliveryFeeEstimate> {
  const supabase = await createClient()
  const resolved = await resolveZoneFee(supabase, commerceId, { lat, lng })

  if (resolved.error || !resolved.feeResult) {
    return { error: resolved.error ?? 'Impossible de calculer les frais de livraison.' }
  }

  return {
    error: null,
    fee: resolved.feeResult.fee,
    distanceKm: Number((resolved.feeResult.distanceMeters / 1000).toFixed(2)),
  }
}

// Server Action de checkout : c'est ELLE, pas le client, qui fait autorité
// sur les prix, les frais de livraison et l'éligibilité de la zone. Le
// panier envoyé par le navigateur ne contient que (productId, quantity) —
// tout le reste (prix, dispo, frais) est rechargé depuis la base.
export async function placeOrder(
  _prevState: CheckoutFormState,
  formData: FormData
): Promise<CheckoutFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  let rawCart: unknown
  try {
    rawCart = JSON.parse(String(formData.get('cart_json') ?? '[]'))
  } catch {
    return { error: 'Panier invalide, réessaie.' }
  }

  const parsed = checkoutSchema.safeParse({
    commerceId: formData.get('commerce_id'),
    cart: rawCart,
    deliveryAddress: formData.get('delivery_address'),
    deliveryLat: formData.get('delivery_lat'),
    deliveryLng: formData.get('delivery_lng'),
    paymentMethod: formData.get('payment_method'),
    clientNote: formData.get('client_note') || undefined,
    useWalletCredit: formData.get('use_wallet_credit') === 'on',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const {
    commerceId,
    cart,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    paymentMethod,
    clientNote,
    useWalletCredit,
  } = parsed.data

  // 1) Le commerce doit exister, être actif, avoir une zone assignée, et
  // l'adresse doit être éligible — puis calcul du tarif (base + distance
  // réelle + majoration éventuelle).
  const resolved = await resolveZoneFee(supabase, commerceId, { lat: deliveryLat, lng: deliveryLng })
  if (resolved.error || !resolved.feeResult || !resolved.zoneId || resolved.minOrderAmount == null) {
    return { error: resolved.error ?? 'Impossible de calculer les frais de livraison.' }
  }
  const { zoneId, minOrderAmount, feeResult } = resolved

  // 2) Recharge les produits depuis la DB : jamais confiance dans le prix/nom du client.
  const productIds = cart.map((item) => item.productId)
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, commerce_id, name, price, is_available, requires_prescription')
    .in('id', productIds)

  if (productsError) {
    return { error: 'Impossible de vérifier ton panier, réessaie.' }
  }

  const missingOrInvalid = productIds.filter(
    (id) => !products?.some((p) => p.id === id && p.is_available && p.commerce_id === commerceId)
  )
  if (missingOrInvalid.length > 0) {
    return {
      error:
        "Un ou plusieurs articles de ton panier ne sont plus disponibles. Mets à jour ton panier et réessaie.",
    }
  }

  const orderItems = cart.map((item) => {
    const product = products!.find((p) => p.id === item.productId)!
    const subtotal = Number((product.price * item.quantity).toFixed(3))
    return {
      product_id: product.id,
      product_name_snapshot: product.name,
      unit_price: product.price,
      quantity: item.quantity,
      subtotal,
    }
  })

  const subtotal = Number(orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(3))

  if (subtotal < minOrderAmount) {
    return { error: `Commande minimum de ${minOrderAmount.toFixed(3)} DT pour cette zone.` }
  }

  const deliveryFee = feeResult.fee

  // Phase 5 — Module 8 : crédit portefeuille appliqué sur les frais de
  // livraison uniquement, plafonné au solde réel (jamais confiance dans un
  // montant envoyé par le client — juste un booléen "je veux l'utiliser").
  let walletCreditApplied = 0
  if (useWalletCredit) {
    const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', user.id).single()
    walletCreditApplied = Number(Math.min(profile?.wallet_balance ?? 0, deliveryFee).toFixed(3))
  }

  const total = Number((subtotal + deliveryFee - walletCreditApplied).toFixed(3))

  // uuid généré ici (plutôt que laissé au défaut de la table) pour pouvoir
  // nommer le fichier de preuve de virement {user_id}/{order_id}.jpg AVANT
  // l'insertion de la commande elle-même.
  const orderId = randomUUID()

  let paymentStatus: 'pending' | 'awaiting_verification' = 'pending'
  let paymentProofUrl: string | null = null

  if (paymentMethod === 'virement') {
    const proofFile = formData.get('payment_proof')
    if (!(proofFile instanceof File) || proofFile.size === 0) {
      return { error: "Merci de joindre une capture d'écran de la preuve de virement." }
    }

    const path = `${user.id}/${orderId}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(path, proofFile, { contentType: proofFile.type || 'image/jpeg', upsert: false })

    if (uploadError) {
      return { error: "Impossible d'envoyer la preuve de paiement, réessaie." }
    }

    paymentProofUrl = path
    paymentStatus = 'awaiting_verification'
  }

  // Phase 5 — Module 7 : ordonnance obligatoire si le panier contient au
  // moins un produit requires_prescription (jamais confiance dans un
  // éventuel flag envoyé par le client — toujours re-dérivé de products).
  let prescriptionUrl: string | null = null
  const needsPrescription = products!.some((p) => p.requires_prescription && cart.some((i) => i.productId === p.id))

  if (needsPrescription) {
    const prescriptionFile = formData.get('prescription')
    if (!(prescriptionFile instanceof File) || prescriptionFile.size === 0) {
      return { error: 'Merci de joindre une photo de ton ordonnance pour les produits qui le nécessitent.' }
    }

    const prescriptionPath = `${user.id}/${orderId}/prescription.jpg`
    const { error: prescriptionUploadError } = await supabase.storage
      .from('prescriptions')
      .upload(prescriptionPath, prescriptionFile, { contentType: prescriptionFile.type || 'image/jpeg', upsert: false })

    if (prescriptionUploadError) {
      return { error: "Impossible d'envoyer l'ordonnance, réessaie." }
    }

    prescriptionUrl = prescriptionPath
  }

  // 4) Insertion de la commande, puis de ses lignes.
  const { error: insertError } = await supabase.from('orders').insert({
    id: orderId,
    client_id: user.id,
    commerce_id: commerceId,
    zone_id: zoneId,
    delivery_address: deliveryAddress,
    delivery_lat: deliveryLat,
    delivery_lng: deliveryLng,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    payment_method: paymentMethod,
    payment_status: paymentStatus,
    payment_proof_url: paymentProofUrl,
    client_note: clientNote ?? null,
    prescription_url: prescriptionUrl,
    wallet_credit_applied: walletCreditApplied,
  })

  if (insertError) {
    return { error: "Impossible de créer la commande, réessaie." }
  }

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems.map((item) => ({ ...item, order_id: orderId })))

  if (itemsError) {
    // Nettoyage : évite une commande "fantôme" sans articles. Aucune policy
    // client ne permet de supprimer une commande — on utilise donc le
    // client admin, exclusivement pour ce rollback système.
    const adminClient = createAdminClient()
    await adminClient.from('orders').delete().eq('id', orderId)
    return { error: "Impossible d'enregistrer les articles de la commande, réessaie." }
  }

  // Débit du portefeuille : via le client admin (service role), qui
  // contourne à la fois RLS et prevent_wallet_self_edit (aucun auth.uid()
  // dans ce contexte) — cf. commentaires sur ces garde-fous dans schema.sql.
  // debit_wallet() fait un UPDATE atomique (wallet_balance = wallet_balance
  // - montant) plutôt qu'un lire-puis-écrire côté application. Pas de
  // rollback si cette étape échoue : la commande reste valide, le pire cas
  // est un crédit non déduit plutôt qu'une commande perdue.
  if (walletCreditApplied > 0) {
    const adminClient = createAdminClient()
    await adminClient.rpc('debit_wallet', { p_profile_id: user.id, p_amount: walletCreditApplied })
    await adminClient
      .from('wallet_credits')
      .insert({ profile_id: user.id, amount: -walletCreditApplied, reason: 'checkout_redemption', order_id: orderId })
  }

  // Phase 5 — Module 4 : notifie le commerce (push). Best-effort, cf.
  // lib/notifications/orderNotifications.ts — ne peut pas faire échouer la
  // commande déjà créée.
  await notifyCommerceNewOrder(orderId)

  // Pas de redirect() ici : on retourne l'id pour que le composant client
  // vide le panier (localStorage) avant de naviguer vers le suivi de commande.
  return { error: null, orderId }
}
