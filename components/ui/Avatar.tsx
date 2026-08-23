import { getPublicStorageUrl } from '@/lib/storage'
import { cn } from '@/lib/utils'

interface AvatarProps {
  fullName: string | null
  avatarUrl: string | null
  // sm : cartes de listing (TripCard/ProductOfferCard/RequestCard).
  // md : reprend le format déjà utilisé par UserMenu.tsx (h-9 w-9).
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-9 w-9 text-sm',
}

function getInitial(fullName: string | null): string {
  return fullName?.trim().charAt(0).toUpperCase() || '?'
}

// Troisième réutilisation du même langage visuel que ProfileAvatarUpload.tsx
// (grand, éditable) et UserMenu.tsx (h-9 w-9, initiale) — extrait ici en
// composant partagé plutôt que dupliqué une 3e/4e/5e fois sur les cartes de
// listing. Contrairement à UserMenu (initiale uniquement), affiche la
// vraie photo quand avatar_url existe.
export function Avatar({ fullName, avatarUrl, size = 'sm', className }: AvatarProps) {
  const initial = getInitial(fullName)

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-600 font-semibold text-white',
        SIZE_CLASSES[size],
        className
      )}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos utilisateur, pas d'optimisation next/image nécessaire pour l'instant
        <img
          src={getPublicStorageUrl('profile-photos', avatarUrl)}
          alt={fullName ?? 'Avatar'}
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  )
}
