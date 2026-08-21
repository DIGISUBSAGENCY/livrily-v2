'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function ReferralCodeCard({ code, shareUrl }: { code: string; shareUrl: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission refusée...) :
      // le code reste affiché en clair juste en dessous, rien de bloquant.
    }
  }

  return (
    <Card>
      <h2 className="font-semibold text-slate-900">Ton code de parrainage</h2>
      <p className="mt-1 text-sm text-slate-500">
        Fais connaître Livrily à tes proches grâce à ton lien personnel.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {shareUrl}
        </code>
        <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">Code : {code}</p>
    </Card>
  )
}
