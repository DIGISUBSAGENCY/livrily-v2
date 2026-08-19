'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'
import type { BankTransferInfo } from '@/types/database'

interface PaymentVirementProps {
  bankInfo: BankTransferInfo | null
}

export function PaymentVirement({ bankInfo }: PaymentVirementProps) {
  const [fileName, setFileName] = useState<string | null>(null)

  if (!bankInfo) {
    return (
      <Alert tone="warning">
        Les coordonnées bancaires ne sont pas encore configurées. Choisis un autre mode de
        paiement ou réessaie plus tard.
      </Alert>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-slate-500">Banque</p>
          <p className="font-medium text-slate-900">{bankInfo.bank_name}</p>
        </div>
        <div>
          <p className="text-slate-500">Titulaire</p>
          <p className="font-medium text-slate-900">{bankInfo.account_holder}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500">RIB</p>
          <p className="font-mono font-medium text-slate-900">{bankInfo.rib}</p>
        </div>
      </div>

      <div>
        <Label htmlFor="payment_proof">Preuve de virement (capture d&apos;écran)</Label>
        <input
          id="payment_proof"
          name="payment_proof"
          type="file"
          accept="image/*"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
        {fileName && <p className="mt-1.5 text-xs text-slate-500">Fichier sélectionné : {fileName}</p>}
        <p className="mt-1.5 text-xs text-slate-500">
          Ta commande sera visible avec le badge « En attente de vérification du paiement »
          jusqu&apos;à validation par notre équipe.
        </p>
      </div>
    </div>
  )
}
