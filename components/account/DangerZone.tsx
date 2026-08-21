'use client'

import { useState, useTransition } from 'react'
import { LogOut, UserX } from 'lucide-react'
import { signOut } from '@/app/(auth)/actions'
import { deactivateAccount } from '@/app/profil/parametres/actions'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

// Désactivation à 2 temps (clic "Désactiver mon compte" révèle une
// confirmation explicite avant le vrai bouton d'action) plutôt qu'un
// window.confirm() natif — moins facile à valider par réflexe, plus
// visible que ce qu'on s'apprête à faire. Libellé "Désactiver" et non
// "Supprimer" : le comportement réel est une désactivation réversible
// (is_active=false), pas une suppression — cf. deactivateAccount() dans
// actions.ts. Le texte doit rester honnête sur ce qu'il fait vraiment.
export function DangerZone() {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await deactivateAccount()
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Se déconnecter</p>
          <p className="text-xs text-slate-500">Ferme ta session sur cet appareil.</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="danger" size="sm">
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Se déconnecter
          </Button>
        </form>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Désactiver mon compte</p>
            <p className="text-xs text-slate-500">
              Désactive ton compte (réversible par le support) et te déconnecte. Tes données ne
              sont pas supprimées.
            </p>
          </div>
          {!confirming && (
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              <UserX className="h-3.5 w-3.5" aria-hidden />
              Désactiver mon compte
            </Button>
          )}
        </div>

        {confirming && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">
              Confirme : ton compte sera désactivé et tu seras déconnecté immédiatement. Contacte
              le support pour le réactiver.
            </p>
            {error && <ErrorText className="mt-2">{error}</ErrorText>}
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Désactivation…' : 'Confirmer la désactivation'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
