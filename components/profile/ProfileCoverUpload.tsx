'use client'

import { useRef, useState } from 'react'
import { useFormState } from 'react-dom'
import { ImagePlus } from 'lucide-react'
import { updateCover, type PhotoUploadState } from '@/app/profil/actions'
import { getPublicStorageUrl } from '@/lib/storage'

interface ProfileCoverUploadProps {
  coverPath: string | null
  editable: boolean
}

const initialState: PhotoUploadState = { error: null }

// Même logique de cache-bust que ProfileAvatarUpload (chemin fixe par
// utilisateur, upsert:true côté action).
export function ProfileCoverUpload({ coverPath, editable }: ProfileCoverUploadProps) {
  const [state, formAction] = useFormState(updateCover, initialState)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const src = preview ?? (coverPath ? `${getPublicStorageUrl('profile-photos', coverPath)}?v=${Date.now()}` : null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    formRef.current?.requestSubmit()
  }

  return (
    <div className="relative h-36 w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-brand-100 to-brand-200 sm:h-48">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Photo de couverture" className="h-full w-full object-cover" />
      )}

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
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-soft backdrop-blur transition hover:bg-white"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
            Modifier la couverture
          </button>
        </form>
      )}

      {state.error && (
        <p className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-2 py-1 text-xs text-red-600 shadow-soft">
          {state.error}
        </p>
      )}
    </div>
  )
}
