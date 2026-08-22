'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { createProposal, type ProposalFormState } from '@/app/(client)/jibli/[id]/actions'
import { AmountStepper } from '@/components/travel/AmountStepper'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'

const initialState: ProposalFormState = { error: null }
const MESSAGE_MAX_LENGTH = 500

interface ProposalFormProps {
  requestId: string
  // Pré-remplissage depuis "Proposer" sur un match Trips (RequestMatchCard)
  // — sourceTripId part en champ caché, revérifié côté serveur
  // (createProposal) avant d'être réellement lié : falsifiable ici, jamais
  // fait confiance tel quel. delivery_fee/pickup_city ne sont que des
  // valeurs de départ, l'utilisateur reste libre de les changer avant
  // d'envoyer — "indication de départ", pas un tarif imposé.
  sourceTripId?: string
  defaultDeliveryFee?: number
  defaultPickupCity?: string
}

export function ProposalForm({ requestId, sourceTripId, defaultDeliveryFee, defaultPickupCity }: ProposalFormProps) {
  const action = createProposal.bind(null, requestId)
  const [state, formAction] = useFormState(action, initialState)
  const [deliveryFee, setDeliveryFee] = useState(defaultDeliveryFee ?? 0)
  const [message, setMessage] = useState('')

  return (
    <form action={formAction} className="space-y-4">
      {sourceTripId && <input type="hidden" name="source_trip_id" value={sourceTripId} />}

      <div>
        <Label htmlFor="item_price">Prix de l&apos;objet — remboursé (DT)</Label>
        <Input id="item_price" name="item_price" type="number" step="0.001" min="0" required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="delivery_fee">Ta proposition — frais de service (DT)</Label>
        <AmountStepper id="delivery_fee" name="delivery_fee" value={deliveryFee} onChange={setDeliveryFee} step={1} />
        <p className="mt-1.5 text-xs text-slate-500">
          C&apos;est le montant que tu proposes pour ce trajet — le client peut l&apos;accepter ou te
          faire une contre-offre. Une fois accepté, il devient ton gain.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="pickup_city">Ville de départ (optionnel)</Label>
          <Input
            id="pickup_city"
            name="pickup_city"
            type="text"
            placeholder="Ex: Lyon"
            defaultValue={defaultPickupCity}
            maxLength={100}
          />
        </div>
        <div>
          <Label htmlFor="travel_date">Date de retour prévue (optionnel)</Label>
          <Input id="travel_date" name="travel_date" type="date" />
        </div>
      </div>

      <div>
        <Label htmlFor="validity">Validité de l&apos;offre (optionnel)</Label>
        <Select id="validity" name="validity" defaultValue="">
          <option value="">Pas de limite</option>
          <option value="24h">24 heures</option>
          <option value="48h">48 heures</option>
          <option value="7d">7 jours</option>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="message">Message (optionnel)</Label>
          <span className="text-xs text-slate-400">
            {message.length}/{MESSAGE_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
          maxLength={MESSAGE_MAX_LENGTH}
          rows={3}
          placeholder="Précise tes disponibilités, comment récupérer l'objet…"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Envoyer ma proposition
      </SubmitButton>
    </form>
  )
}
