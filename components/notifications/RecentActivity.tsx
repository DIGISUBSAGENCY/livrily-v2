import Link from 'next/link'
import { Bell } from 'lucide-react'
import { hrefFor } from '@/lib/notifications/hrefFor'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import type { NotificationRow } from '@/lib/notifications/actions'
import { Heading } from '@/components/ui/Typography'

interface RecentActivityProps {
  notifications: NotificationRow[]
}

// "Activité récente" du dashboard — réutilise getRecentNotifications() (déjà
// en prod, cf. NotificationBell.tsx) et son rendu visuel (pastille lue/non
// lue, même style de ligne), pas un nouveau flux de notifications. Lecture
// seule ici (pas de marquage lu au clic, contrairement à la cloche) : cette
// section est un aperçu, la gestion complète reste dans la cloche.
export function RecentActivity({ notifications }: RecentActivityProps) {
  return (
    <section className="mt-8">
      <Heading level="h3" as="h2" className="mb-3 flex items-center gap-1.5">
        <Bell className="h-5 w-5 text-brand-600" aria-hidden />
        Activité récente
      </Heading>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} className="mt-0 py-4">
            <p>Aucune notification pour l&apos;instant.</p>
          </EmptyState>
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100 p-0">
          {notifications.map((notification) => {
            const href = hrefFor(notification)
            const content = (
              <div className="flex items-start gap-2.5 px-4 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${notification.read_at ? 'bg-transparent' : 'bg-brand-600'}`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className={`text-sm ${notification.read_at ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>
                    {notification.title}
                  </p>
                  {notification.body && <p className="mt-0.5 text-xs text-slate-500">{notification.body}</p>}
                  <p className="mt-1 text-xs text-slate-400">{new Date(notification.created_at).toLocaleString('fr-TN')}</p>
                </div>
              </div>
            )

            return href ? (
              <Link key={notification.id} href={href} className="block transition-colors hover:bg-slate-50">
                {content}
              </Link>
            ) : (
              <div key={notification.id}>{content}</div>
            )
          })}
        </Card>
      )}
    </section>
  )
}
