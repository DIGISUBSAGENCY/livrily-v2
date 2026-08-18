'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ActionResult {
  error: string | null
}

// Upload des 2 fichiers (chemins fixes {user_id}/id-document.jpg et
// {user_id}/selfie.jpg, upsert:true — une resoumission écrase les
// précédents, cohérent avec identity_verifications.profile_id unique côté
// DB) puis appel du RPC submit_identity_verification(), qui fait le reste
// (upsert de la ligne, remise à 'pending', vidage des champs de revue).
export async function submitIdentityVerification(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Non authentifié.' }

  const idDocument = formData.get('id_document')
  const selfie = formData.get('selfie')

  if (!(idDocument instanceof File) || idDocument.size === 0) {
    return { error: "Merci de joindre une photo de ta pièce d'identité." }
  }
  if (!(selfie instanceof File) || selfie.size === 0) {
    return { error: 'Merci de joindre un selfie.' }
  }

  const idDocumentPath = `${user.id}/id-document.jpg`
  const selfiePath = `${user.id}/selfie.jpg`

  const [idDocumentUpload, selfieUpload] = await Promise.all([
    supabase.storage
      .from('identity-documents')
      .upload(idDocumentPath, idDocument, { contentType: idDocument.type || 'image/jpeg', upsert: true }),
    supabase.storage
      .from('identity-documents')
      .upload(selfiePath, selfie, { contentType: selfie.type || 'image/jpeg', upsert: true }),
  ])

  if (idDocumentUpload.error || selfieUpload.error) {
    console.error('[verification-identite] upload a échoué', {
      idDocumentError: idDocumentUpload.error?.message,
      selfieError: selfieUpload.error?.message,
    })
    return { error: "Impossible d'envoyer tes documents, réessaie." }
  }

  const { error: rpcError } = await supabase.rpc('submit_identity_verification', {
    p_id_document_url: idDocumentPath,
    p_selfie_url: selfiePath,
  })

  if (rpcError) {
    console.error('[verification-identite] submit_identity_verification a échoué', {
      message: rpcError.message,
      code: rpcError.code,
    })
    return { error: 'Impossible de soumettre ta vérification, réessaie.' }
  }

  revalidatePath('/profil/verification-identite')
  revalidatePath('/jibli')
  return { error: null }
}
