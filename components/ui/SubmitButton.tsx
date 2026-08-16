'use client'

// Bouton de soumission de formulaire (Server Action) qui affiche son propre
// état "en cours" via useFormStatus — doit être un enfant du <form>, pas le
// composant qui porte l'action lui-même.
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/Button'
import type { ComponentProps } from 'react'

interface SubmitButtonProps extends Omit<ComponentProps<typeof Button>, 'type'> {
  pendingLabel?: string
}

export function SubmitButton({ children, pendingLabel = 'Chargement…', disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
