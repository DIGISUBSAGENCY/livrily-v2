'use client'

import { useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import { Camera } from 'lucide-react'
import { updateAvatar, type PhotoUploadState } from '@/app/profil/actions'
import { getPublicStorageUrl } from '@/lib/storage'

interface ProfileAvatarUploadProps {
  fullName: string | null
  email: string | null
  avatarPath: string | null
  editable: boolean
}

const initialState: PhotoUploadState = { error: null }

function getInitial(fullName: string | null, email: string | null): string {
  const source = fullName?.trim() || email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

// Cache-bust via ?v=timestamp : le chemin de stockage est fixe par
// utilisateur ({user_id}/avatar.jpg, cf. actions.ts upsert:true), donc sans
// ça le navigateur continuerait d'afficher l'ancienne image après un
// remplacement — même bug que pour une photo de profil classique.
export function ProfileAvatarUpload({ fullName, email, avatarPath, editable }: ProfileAvatarUploadProps) {
  const [state, formAction] = useFormState(updateAvatar, initialState)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const initial = getInitial(fullName, email)
  const src = preview ?? (avatarPath ? `${getPublicStorageUrl('profile-photos', avatarPath)}?v=${Date.now()}` : null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    formRef.current?.requestSubmit()
  }

  return (
    <div className="relative h-24 w-24 flex-shrink-0 sm:h-28 sm:w-28">
      <div className="h-full w-full overflow-hidden rounded-full border-4 border-white bg-brand-600 shadow-soft">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={fullName ?? 'Avatar'} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white">
            {initial}
          </div>
        )}
      </div>

      {editable && (
        <form ref={formRef} action={formAction} className="contents">
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Modifier la photo de profil"
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-soft transition hover:bg-brand-700"
          >
            <Camera className="h-4 w-4" aria-hidden />
          </button>
        </form>
      )}

      {state.error && (
        <p className="absolute -bottom-6 left-1/2 w-40 -translate-x-1/2 text-center text-xs text-red-600">
          {state.error}
        </p>
      )}
    </div>
  )
}
