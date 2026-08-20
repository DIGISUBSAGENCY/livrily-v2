import { Badge } from '@/components/ui/Badge'

// Distinct de la convention "inactif = neutre" utilisée pour virement
// (BankTransferRow) : suspendre un COMPTE UTILISATEUR est un geste plus
// fort qu'une simple désactivation de fiche, d'où le rouge (danger) plutôt
// que le gris — cohérent avec le rouge déjà utilisé pour "rejeté"/"annulé"
// ailleurs (WithdrawalStatusBadge...).
export function AccountStatusBadge({ isActive }: { isActive: boolean }) {
  return <Badge tone={isActive ? 'success' : 'danger'}>{isActive ? 'Actif' : 'Suspendu'}</Badge>
}
