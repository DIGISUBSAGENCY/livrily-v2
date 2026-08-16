// Construit l'URL publique d'un objet dans un bucket Storage public (ex:
// travel-request-photos). Pure construction d'URL, pas d'appel réseau —
// utilisable aussi bien en Server qu'en Client Component sans instancier de
// client Supabase.
export function getPublicStorageUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}
