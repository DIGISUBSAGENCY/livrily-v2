'use client'

import { useEffect, useState } from 'react'
import { useFormState } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/lib/cart/CartContext'
import { placeOrder, estimateDeliveryFee, type CheckoutFormState } from '@/app/(client)/checkout/actions'
import { AddressAutocomplete, type SelectedPlace } from '@/components/maps/AddressAutocomplete'
import { PaymentMethodSelector } from '@/components/checkout/PaymentMethodSelector'
import { Label } from '@/components/ui/Label'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { Card } from '@/components/ui/Card'
import { formatTND } from '@/lib/format'
import type { BankTransferInfo, PaymentMethod } from '@/types/database'

const initialState: CheckoutFormState = { error: null }

interface CheckoutFormProps {
  defaultAddress: string | null
  defaultLat: number | null
  defaultLng: number | null
  bankInfo: BankTransferInfo | null
  walletBalance: number
}

export function CheckoutForm({ defaultAddress, defaultLat, defaultLng, bankInfo, walletBalance }: CheckoutFormProps) {
  const { items, clearCart } = useCart()
  const router = useRouter()
  const [state, formAction] = useFormState(placeOrder, initialState)
  const [place, setPlace] = useState<SelectedPlace | null>(
    defaultAddress != null && defaultLat != null && defaultLng != null
      ? { address: defaultAddress, lat: defaultLat, lng: defaultLng }
      : null
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [clientNote, setClientNote] = useState('')
  const [feeEstimate, setFeeEstimate] = useState<{ fee: number; distanceKm: number } | null>(null)
  const [feeError, setFeeError] = useState<string | null>(null)
  const [feeLoading, setFeeLoading] = useState(false)
  const [useWalletCredit, setUseWalletCredit] = useState(false)

  // La Server Action ne fait pas de redirect() elle-même (elle doit d'abord
  // laisser ce composant vider le panier côté client), donc on navigue ici
  // une fois qu'un orderId nous revient.
  useEffect(() => {
    if (state.orderId) {
      clearCart()
      router.push(`/commandes/${state.orderId}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orderId])

  // Estimation live des frais de livraison dès qu'une adresse valide est
  // sélectionnée — débattue pour éviter un appel serveur à chaque frappe
  // dans l'autocomplete. Ne fait pas foi : placeOrder recalcule tout côté
  // serveur à la validation (cf. resolveZoneFee dans checkout/actions.ts).
  const commerceIdForEstimate = items[0]?.commerceId
  useEffect(() => {
    if (!commerceIdForEstimate || place?.lat == null || place?.lng == null) {
      setFeeEstimate(null)
      setFeeError(null)
      return
    }

    let cancelled = false
    setFeeLoading(true)
    const timeout = setTimeout(async () => {
      const result = await estimateDeliveryFee(commerceIdForEstimate, place.lat!, place.lng!)
      if (cancelled) return
      setFeeLoading(false)
      if (result.error || result.fee == null || result.distanceKm == null) {
        setFeeEstimate(null)
        setFeeError(result.error)
      } else {
        setFeeEstimate({ fee: result.fee, distanceKm: result.distanceKm })
        setFeeError(null)
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      setFeeLoading(false)
    }
  }, [commerceIdForEstimate, place?.lat, place?.lng])

  if (items.length === 0) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="text-slate-600">Ton panier est vide.</p>
        <Link href="/commerces" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
          Parcourir les commerces
        </Link>
      </Card>
    )
  }

  const commerceId = items[0].commerceId
  const commerceName = items[0].commerceName
  const needsPrescription = items.some((item) => item.requiresPrescription)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const cartPayload = JSON.stringify(items.map((i) => ({ productId: i.productId, quantity: i.quantity })))
  const hasCoordinates = place?.lat != null && place?.lng != null
  const canSubmit = hasCoordinates && !feeError && !(paymentMethod === 'virement' && !bankInfo)

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Adresse de livraison</h2>
          <Label htmlFor="address">Adresse</Label>
          <AddressAutocomplete id="address" defaultValue={defaultAddress ?? undefined} onPlaceSelected={setPlace} />
          {place && hasCoordinates && (
            <p className="mt-1.5 text-xs text-slate-500">Adresse sélectionnée : {place.address}</p>
          )}
          {place && !hasCoordinates && (
            <p className="mt-1.5 text-xs text-red-600">
              Impossible de valider une commande sans géolocalisation précise de l&apos;adresse
              (nécessaire pour calculer les frais de livraison). Configure la clé Google Maps.
            </p>
          )}
          <input type="hidden" name="delivery_address" value={place?.address ?? ''} />
          <input type="hidden" name="delivery_lat" value={place?.lat ?? ''} />
          <input type="hidden" name="delivery_lng" value={place?.lng ?? ''} />
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-slate-900">Note pour le commerce (optionnel)</h2>
          <textarea
            name="client_note"
            value={clientNote}
            onChange={(e) => setClientNote(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Ex : sonner à l'interphone, code d'entrée…"
            className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </Card>

        {needsPrescription && (
          <Card className="border-amber-200 bg-amber-50">
            <h2 className="mb-2 font-semibold text-amber-900">Ordonnance requise</h2>
            <p className="mb-3 text-sm text-amber-800">
              Ton panier contient un produit sur ordonnance. Joins une photo lisible de
              l&apos;ordonnance — le pharmacien la vérifie avant d&apos;accepter ta commande.
            </p>
            <Label htmlFor="prescription">Photo de l&apos;ordonnance</Label>
            <input
              id="prescription"
              name="prescription"
              type="file"
              accept="image/*"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-amber-700 hover:file:bg-amber-100"
            />
          </Card>
        )}

        <Card>
          <PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} bankInfo={bankInfo} />
        </Card>
      </div>

      <Card className="h-fit space-y-4">
        <h2 className="font-semibold text-slate-900">Récapitulatif — {commerceName}</h2>

        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-2 text-slate-700">
              <span className="truncate">
                {item.quantity} × {item.name}
              </span>
              <span className="flex-shrink-0">{formatTND(item.price * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1 border-t border-slate-200 pt-3 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>Sous-total</span>
            <span>{formatTND(subtotal)}</span>
          </div>

          {!hasCoordinates && (
            <p className="text-xs text-slate-400">
              Sélectionne une adresse pour voir les frais de livraison estimés.
            </p>
          )}
          {hasCoordinates && feeLoading && <p className="text-xs text-slate-400">Calcul des frais de livraison…</p>}
          {hasCoordinates && !feeLoading && feeError && <p className="text-xs text-red-600">{feeError}</p>}
          {hasCoordinates && !feeLoading && feeEstimate && (
            <>
              <div className="flex justify-between">
                <span>Frais de livraison (≈ {feeEstimate.distanceKm} km)</span>
                <span>{formatTND(feeEstimate.fee)}</span>
              </div>

              {walletBalance > 0 && (
                <label className="flex items-center justify-between gap-2 py-1">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="use_wallet_credit"
                      checked={useWalletCredit}
                      onChange={(e) => setUseWalletCredit(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Utiliser mon crédit ({formatTND(walletBalance)})
                  </span>
                </label>
              )}

              <div className="flex justify-between font-semibold text-slate-900">
                <span>Total estimé</span>
                <span>
                  {formatTND(
                    subtotal +
                      feeEstimate.fee -
                      (useWalletCredit ? Math.min(walletBalance, feeEstimate.fee) : 0)
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-400">Montant final confirmé à la validation de la commande.</p>
            </>
          )}
        </div>

        <input type="hidden" name="commerce_id" value={commerceId} />
        <input type="hidden" name="cart_json" value={cartPayload} />

        {state.error && <ErrorText>{state.error}</ErrorText>}

        <SubmitButton className="w-full" disabled={!canSubmit} pendingLabel="Validation…">
          Valider la commande
        </SubmitButton>
      </Card>
    </form>
  )
}
