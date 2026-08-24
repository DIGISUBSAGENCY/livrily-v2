'use client'

import { useMemo, useState } from 'react'
import { useFormState } from 'react-dom'
import { purchaseBoostVirement, type BoostActionState, type BoostItemType } from '@/app/(client)/jibli/boost-actions'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatTND } from '@/lib/format'
import type { BankTransferInfo } from '@/types/database'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib'>

// Forme brute renvoyée par get_boost_pricing_tiers() (types/database.ts) —
// pas de mapping camelCase, ce composant consomme directement la ligne RPC
// comme TripCard/ProductOfferCard consomment directement leurs lignes DB.
interface BoostPricingTier {
  duration_days: number
  price_tnd: number
}

interface BoostPaymentProps {
  itemType: BoostItemType
  itemId: string
  bankInfo: PlatformPaymentInfo | null
  // Grille complète (1-7 jours) — remplace priceTnd/durationDays fixes
  // (tarification par palier, Phase 3 brique 6/N). Le prix affiché se
  // recalcule au choix de durée par un simple lookup dans ce tableau déjà
  // chargé, jamais un nouvel appel réseau.
  tiers: BoostPricingTier[]
  // Non null si l'item est déjà boosté (boosted_until dans le futur) — sert
  // uniquement à afficher que cet achat prolonge un boost en cours plutôt
  // que d'en démarrer un nouveau (le cumul lui-même est géré par
  // purchase_boost_virement() côté base, cf. schema.sql — greatest()),
  // quelle que soit la durée choisie ici.
  currentBoostedUntil: string | null
}

const initialState: BoostActionState = { error: null }
const DEFAULT_DURATION_DAYS = 3 // ancien palier unique — reste le choix pré-sélectionné le plus familier

// Virement uniquement pour l'instant (pas de bascule Flouci comme
// TakeProductOfferPayment/AcceptProposalPayment) : seule
// purchase_boost_virement() existe côté base, un chemin Flouci est
// explicitement différé à un lot ultérieur (cf. plan validé). Nouveau
// composant dédié plutôt qu'une réutilisation des deux autres : le fond
// (upload preuve, formulaire) est un mirror volontaire, mais le sujet
// (booster un item déjà publié, pas payer une mission) est différent.
export function BoostPayment({ itemType, itemId, bankInfo, tiers, currentBoostedUntil }: BoostPaymentProps) {
  const sortedTiers = useMemo(() => [...tiers].sort((a, b) => a.duration_days - b.duration_days), [tiers])
  const [durationDays, setDurationDays] = useState(
    () => sortedTiers.find((t) => t.duration_days === DEFAULT_DURATION_DAYS)?.duration_days ?? sortedTiers[0]?.duration_days ?? 1
  )
  const selectedTier = sortedTiers.find((t) => t.duration_days === durationDays) ?? sortedTiers[0]

  const action = purchaseBoostVirement.bind(null, itemType, itemId)
  const [state, formAction] = useFormState(action, initialState)

  if (sortedTiers.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <p className="text-sm text-amber-700">Tarification indisponible pour le moment, réessaie plus tard.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">
          Mets cet item en avant pour {formatTND(selectedTier.price_tnd)}, {durationDays} jour{durationDays > 1 ? 's' : ''}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {currentBoostedUntil
            ? `Déjà en avant jusqu'au ${new Date(currentBoostedUntil).toLocaleDateString('fr-TN')} — cet achat prolonge la mise en avant d'autant, sans rien perdre du temps déjà payé.`
            : "Apparaît en priorité dans les listings pendant toute la durée."}
        </p>
      </div>

      {!bankInfo ? (
        <p className="text-sm text-amber-700">Coordonnées bancaires non configurées, réessaie plus tard.</p>
      ) : (
        <form action={formAction} className="space-y-3">
          <div>
            <Label htmlFor="duration_days">Durée</Label>
            <Select
              id="duration_days"
              name="duration_days"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
            >
              {sortedTiers.map((tier) => (
                <option key={tier.duration_days} value={tier.duration_days}>
                  {tier.duration_days} jour{tier.duration_days > 1 ? 's' : ''} — {formatTND(tier.price_tnd)}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-sm text-slate-600">
            <p>
              <span className="text-slate-500">Banque : </span>
              {bankInfo.bank_name}
            </p>
            <p>
              <span className="text-slate-500">Titulaire : </span>
              {bankInfo.account_holder}
            </p>
            <p className="font-mono">
              <span className="font-sans text-slate-500">RIB : </span>
              {bankInfo.rib}
            </p>
          </div>
          <div>
            <Label htmlFor="payment_proof">Preuve de virement</Label>
            <input
              id="payment_proof"
              name="payment_proof"
              type="file"
              accept="image/*"
              required
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          {state.error && <ErrorText>{state.error}</ErrorText>}
          <SubmitButton size="sm" pendingLabel="Envoi…">
            Confirmer le virement
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
