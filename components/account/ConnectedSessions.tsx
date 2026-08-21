'use client'

import { useState, useTransition } from 'react'
import { Laptop2, LogOut } from 'lucide-react'
import { revokeSession } from '@/app/profil/parametres/actions'
import { parseUserAgentLabel } from '@/lib/parseUserAgent'
import { formatRelativeTime } from '@/lib/relativeTime'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorText } from '@/components/ui/ErrorText'

export interface SessionRow {
  id: string
  created_at: string
  updated_at: string
  user_agent: string | null
  ip: string | null
}

interface ConnectedSessionsProps {
  initialSessions: SessionRow[]
  currentSessionId: string | null
}

// L'ip revient au format inet de Postgres ("1.2.3.4/32") une fois castée
// en texte côté RPC — le masque n'a aucun sens à afficher pour une IP
// individuelle, on le retire.
function cleanIp(ip: string | null): string {
  if (!ip) return 'IP inconnue'
  return ip.replace(/\/\d+$/, '')
}

// Bouton de révocation masqué sur la session courante (décision explicite :
// "Se déconnecter" dans Actions sensibles couvre déjà ce cas, évite le
// scénario "je me déconnecte moi-même en plein milieu de la page").
export function ConnectedSessions({ initialSessions, currentSessionId }: ConnectedSessionsProps) {
  const [sessions, setSessions] = useState(initialSessions)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const sorted = [...sessions].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  function handleRevoke(sessionId: string) {
    setError(null)
    setPendingId(sessionId)
    startTransition(async () => {
      const result = await revokeSession(sessionId)
      if (result.error) {
        setError(result.error)
      } else {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      }
      setPendingId(null)
    })
  }

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-500">Aucune session active trouvée.</p>
  }

  return (
    <div className="space-y-3">
      {error && <ErrorText>{error}</ErrorText>}
      {sorted.map((session) => {
        const isCurrent = session.id === currentSessionId
        return (
          <div key={session.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
            <div className="flex items-center gap-3">
              <Laptop2 className="h-5 w-5 flex-shrink-0 text-slate-400" aria-hidden />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900">{parseUserAgentLabel(session.user_agent)}</p>
                  {isCurrent && <Badge tone="success">Cet appareil</Badge>}
                </div>
                <p className="text-xs text-slate-500">
                  {cleanIp(session.ip)} · Vu {formatRelativeTime(session.updated_at)}
                </p>
              </div>
            </div>

            {!isCurrent && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRevoke(session.id)}
                disabled={pendingId === session.id}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                {pendingId === session.id ? 'Déconnexion…' : 'Déconnecter'}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
