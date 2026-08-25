'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import {
  getRecentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from '@/lib/notifications/actions'
import { hrefFor } from '@/lib/notifications/hrefFor'

interface NotificationBellProps {
  initialUnreadCount: number
}

// Même pattern d'ouverture/fermeture que UserMenu.tsx/AdminNav.tsx (bouton +
// onBlur différé plutôt qu'un listener de clic extérieur), pour rester
// cohérent avec les deux dropdowns déjà établis dans ce projet. Visible sur
// mobile ET desktop (contrairement à UserMenu, caché sous sm) : une liste de
// notifications n'a pas sa place dans MobileNav (menu plein écran, état
// d'ouverture distinct) — icône autonome à côté.
//
// La liste est rechargée à chaque ouverture (pas de cache, pas de
// Supabase Realtime nulle part dans ce projet) — cohérent avec le reste de
// l'app, qui se rafraîchit à l'interaction plutôt qu'en direct.
export function NotificationBell({ initialUnreadCount }: NotificationBellProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleToggle() {
    const next = !isOpen
    setIsOpen(next)
    if (!next) return

    setIsLoading(true)
    const data = await getRecentNotifications()
    setNotifications(data)
    setIsLoading(false)
  }

  async function handleNotificationClick(notification: NotificationRow) {
    setIsOpen(false)
    if (!notification.read_at) {
      setUnreadCount((count) => Math.max(0, count - 1))
      setNotifications((current) =>
        current?.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)) ?? null
      )
      await markNotificationRead(notification.id)
    }
    const href = hrefFor(notification)
    if (href) router.push(href)
  }

  async function handleMarkAllRead() {
    setUnreadCount(0)
    setNotifications((current) => current?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null)
    await markAllNotificationsRead()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        aria-label="Notifications"
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-brand-700"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-white py-2 shadow-soft-lg">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="my-1 border-t border-slate-100" />

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Chargement…</p>
            ) : !notifications || notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Aucune notification pour l&apos;instant.</p>
            ) : (
              notifications.map((notification) => {
                const href = hrefFor(notification)
                const content = (
                  <div className="flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-slate-50">
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

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className="block w-full"
                    disabled={!href && !!notification.read_at}
                  >
                    {content}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
