import { Smartphone } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'

// Composant isolé et facilement branchable : quand l'intégration Flouci
// (FLOUCI_APP_TOKEN/FLOUCI_APP_SECRET, cf. .env.local.example) sera prête,
// c'est ici qu'on ajoutera la redirection vers le flux de paiement Flouci
// et la gestion du retour (payment_ref). Pour l'instant, la commande est
// simplement enregistrée avec payment_status = 'pending' — on n'invente
// aucune confirmation de paiement fictive.
export function PaymentFlouci() {
  return (
    <Alert tone="info" icon={Smartphone} title="Paiement en ligne Flouci">
      L&apos;intégration du paiement en ligne arrive bientôt. Ta commande sera enregistrée en
      attente de paiement — tu pourras payer en espèces à la livraison en attendant.
    </Alert>
  )
}
