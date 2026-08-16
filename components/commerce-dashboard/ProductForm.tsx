'use client'

import { useFormState } from 'react-dom'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { ErrorText } from '@/components/ui/ErrorText'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { ProductFormState } from '@/app/(commerce)/commerce/produits/actions'
import type { Product } from '@/types/database'

interface ProductFormProps {
  action: (prevState: ProductFormState, formData: FormData) => Promise<ProductFormState>
  product?: Product
  submitLabel: string
  showPrescriptionField?: boolean
}

const initialState: ProductFormState = { error: null }

export function ProductForm({ action, product, submitLabel, showPrescriptionField }: ProductFormProps) {
  const [state, formAction] = useFormState(action, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="name">Nom</Label>
        <Input id="name" name="name" defaultValue={product?.name} required hasError={!!state.error} />
      </div>

      <div>
        <Label htmlFor="description">Description (optionnel)</Label>
        <textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ''}
          rows={3}
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="price">Prix (DT)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="0.001"
            min="0"
            defaultValue={product?.price}
            required
            hasError={!!state.error}
          />
        </div>
        <div>
          <Label htmlFor="unit">Unité</Label>
          <Input id="unit" name="unit" defaultValue={product?.unit ?? 'pièce'} required />
        </div>
      </div>

      <div>
        <Label htmlFor="image_url">URL de l&apos;image (optionnel)</Label>
        <Input id="image_url" name="image_url" type="url" defaultValue={product?.image_url ?? ''} placeholder="https://…" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="is_available"
          defaultChecked={product?.is_available ?? true}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Disponible à la vente
      </label>

      {showPrescriptionField && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="requires_prescription"
            defaultChecked={product?.requires_prescription ?? false}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Nécessite une ordonnance
        </label>
      )}

      {state.error && <ErrorText>{state.error}</ErrorText>}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  )
}
