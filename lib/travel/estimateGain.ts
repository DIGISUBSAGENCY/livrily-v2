// Estimation du gain voyageur affichée sur les cartes de demande (/jibli),
// pour qu'un voyageur n'ait pas à calculer lui-même si une demande vaut le
// coup. Deux cas :
//   - le voyageur a déjà une proposition sur cette demande : le gain
//     affiché est RÉEL (son propre item_price/delivery_fee, cf. RLS —
//     personne ne peut voir les propositions des autres voyageurs).
//   - sinon : une SUGGESTION, dérivée de budget_max (le seul montant connu
//     avant qu'une proposition existe). Pas une promesse ni un calcul
//     garanti — juste un ordre de grandeur pour aider à trier les demandes.
const SUGGESTED_FEE_RATE = 0.15 // 15% du budget total suggéré comme frais de service voyageur

export interface GainEstimate {
  amount: number
  percentOfItemPrice: number
  isSuggestion: boolean
}

export function estimateSuggestedGain(budgetMax: number): GainEstimate {
  const amount = Math.round(budgetMax * SUGGESTED_FEE_RATE * 100) / 100
  const impliedItemPrice = Math.max(budgetMax - amount, 0.01) // évite une division par ~0 sur un budget dérisoire
  return {
    amount,
    percentOfItemPrice: Math.round((amount / impliedItemPrice) * 100),
    isSuggestion: true,
  }
}

export function actualGainFromProposal(itemPrice: number, deliveryFee: number): GainEstimate {
  const safeItemPrice = Math.max(itemPrice, 0.01)
  return {
    amount: deliveryFee,
    percentOfItemPrice: Math.round((deliveryFee / safeItemPrice) * 100),
    isSuggestion: false,
  }
}
