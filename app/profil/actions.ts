'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { bioSchema } from '@/lib/validations/auth'

export interface PhotoUploadState {
  error: string | null
}

// Extension dérivée du type MIME plutôt que du nom de fichier original
// (jamais fiable — certains navigateurs/OS envoient un nom sans extension
// ou avec la mauvaise casse). upsert: true ici (contrairement aux photos
// d'annonce dans nouvelle-demande/actions.ts) : un avatar/cover a un chemin
// fixe par utilisateur ({user_id}/avatar.jpg), on veut remplacer, pas
// accumuler des fichiers orphelins à chaque changement de photo.
function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

async function uploadProfilePhoto(kind: 'avatar' | 'cover', formData: FormData): Promise<PhotoUploadState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Tu dois être connecté.' }

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choisis une photo.' }
  }

  const path = `${user.id}/${kind}.${extensionFor(file.type)}`
  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })

  if (uploadError) {
    return { error: "Impossible d'envoyer la photo, réessaie." }
  }

  // Objet d'update explicite par branche plutôt qu'une clé calculée : le
  // typage strict de Database['public']['Tables']['profiles']['Update']
  // rejette un index signature générique ({ [column]: path }).
  const { error: updateError } =
    kind === 'avatar'
      ? await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id)
      : await supabase.from('profiles').update({ cover_url: path }).eq('id', user.id)

  if (updateError) {
    return { error: "Photo envoyée mais impossible de l'enregistrer, réessaie." }
  }

  revalidatePath('/profil')
  return { error: null }
}

export async function updateAvatar(_prev: PhotoUploadState, formData: FormData): Promise<PhotoUploadState> {
  return uploadProfilePhoto('avatar', formData)
}

export async function updateCover(_prev: PhotoUploadState, formData: FormData): Promise<PhotoUploadState> {
  return uploadProfilePhoto('cover', formData)
}

export interface BioFormState {
  error: string | null
}

export async function updateBio(_prev: BioFormState, formData: FormData): Promise<BioFormState> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Tu dois être connecté.' }

  const parsed = bioSchema.safeParse({ bio: formData.get('bio') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Présentation invalide.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ bio: parsed.data.bio })
    .eq('id', user.id)

  if (updateError) {
    return { error: "Impossible d'enregistrer, réessaie." }
  }

  revalidatePath('/profil')
  return { error: null }
}
