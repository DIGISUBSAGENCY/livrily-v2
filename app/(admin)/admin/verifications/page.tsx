import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { VerificationActions } from '@/components/admin/VerificationActions'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

// Même structure que /admin/jibli-paiements : liste des soumissions
// 'pending', URLs signées pour les deux photos (bucket privé, jamais
// d'accès public direct), actions Approuver/Rejeter.
export default async function AdminVerificationsPage() {
  const supabase = await createClient()

  const { data: verifications, error } = await supabase
    .from('identity_verifications')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const profileIds = Array.from(new Set((verifications ?? []).map((v) => v.profile_id)))
  const { data: profiles } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', profileIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null; phone: string | null }[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const signedIdDocUrls = new Map<string, string>()
  const signedSelfieUrls = new Map<string, string>()
  for (const v of verifications ?? []) {
    const [idDoc, selfie] = await Promise.all([
      supabase.storage.from('identity-documents').createSignedUrl(v.id_document_url, 3600),
      supabase.storage.from('identity-documents').createSignedUrl(v.selfie_url, 3600),
    ])
    if (idDoc.data?.signedUrl) signedIdDocUrls.set(v.id, idDoc.data.signedUrl)
    if (selfie.data?.signedUrl) signedSelfieUrls.set(v.id, selfie.data.signedUrl)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
        <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden />
        Vérifications d&apos;identité
      </h1>
      <p className="mt-1 text-sm text-slate-500">Soumissions en attente d&apos;examen.</p>

      {error && <p className="mt-8 text-sm text-red-600">Impossible de charger les vérifications.</p>}

      {!error && verifications && verifications.length === 0 && (
        <div className="mt-16 flex flex-col items-center text-center text-slate-500">
          <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" aria-hidden />
          <p>Aucune vérification en attente.</p>
        </div>
      )}

      {!error && verifications && verifications.length > 0 && (
        <div className="mt-6 space-y-4">
          {verifications.map((v) => {
            const profile = profileById.get(v.profile_id)
            return (
              <Card key={v.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{profile?.full_name ?? 'Utilisateur'}</p>
                    <p className="text-xs text-slate-500">{profile?.email ?? profile?.phone ?? ''}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Soumis le {new Date(v.created_at).toLocaleString('fr-TN')}
                    </p>
                  </div>
                  <Badge tone="warning">En attente</Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Pièce d&apos;identité</p>
                    {signedIdDocUrls.has(v.id) && (
                      // eslint-disable-next-line @next/next/no-img-element -- preuve utilisateur via URL signée temporaire
                      <img
                        src={signedIdDocUrls.get(v.id)}
                        alt="Pièce d'identité"
                        className="max-h-56 w-full rounded-lg border border-slate-200 object-contain"
                      />
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Selfie</p>
                    {signedSelfieUrls.has(v.id) && (
                      // eslint-disable-next-line @next/next/no-img-element -- preuve utilisateur via URL signée temporaire
                      <img
                        src={signedSelfieUrls.get(v.id)}
                        alt="Selfie"
                        className="max-h-56 w-full rounded-lg border border-slate-200 object-contain"
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <VerificationActions verificationId={v.id} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}
