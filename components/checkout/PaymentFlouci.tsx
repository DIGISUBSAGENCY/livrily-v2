import { Smartphone } from 'lucide-react'

// Composant isolé et facilement branchable : quand l'intégration Flouci
// (FLOUCI_APP_TOKEN/FLOUCI_APP_SECRET, cf. .env.local.example) sera prête,
// c'est ici qu'on ajoutera la redirection vers le flux de paiement Flouci
// et la gestion du retour (payment_ref). Pour l'instant, la commande est
// simplement enregistrée avec payment_status = 'pending' — on n'invente
// aucune confirmation de paiement fictive.
export function PaymentFlouci() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
      <Smartphone className="h-5 w-5 flex-shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Paiement en ligne Flouci</p>
        <p className="mt-1">
          L&apos;intégration du paiement en ligne arrive bientôt. Ta commande sera enregistrée en
          attente de paiement — tu pourras payer en espèces à la livraison en attendant.
        </p>
      </div>
    </div>
  )
}
