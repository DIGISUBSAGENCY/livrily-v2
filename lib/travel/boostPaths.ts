// Chemins de navigation post-achat boost — extraits de boost-actions.ts
// (chantier popup de confirmation) : purchaseBoostVirement() ne fait plus
// de redirect() serveur sur succès (la popup doit s'afficher AVANT toute
// navigation), donc BoostPayment.tsx (composant client) doit naviguer
// lui-même une fois la popup fermée, et a donc besoin de ces deux
// fonctions. Un fichier 'use server' ne peut exporter que des fonctions
// async liées à des Server Actions (contrainte Next.js) — impossible d'y
// laisser ces fonctions plain et de les importer depuis un composant
// client. Même raisonnement que l'extraction de hrefFor.ts hors de
// NotificationBell.tsx : module neutre, importable des deux côtés.
export type BoostItemType = 'trip' | 'offer' | 'request'

export function detailPath(itemType: BoostItemType, itemId: string): string {
  if (itemType === 'trip') return `/jibli/trips/${itemId}`
  if (itemType === 'offer') return `/jibli/offres/${itemId}`
  return `/jibli/${itemId}`
}

export function listingPath(itemType: BoostItemType): string {
  if (itemType === 'trip') return '/jibli/trips'
  if (itemType === 'offer') return '/jibli/offres'
  return '/jibli'
}
