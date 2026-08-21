// URL de base du site, utilisée pour tout lien absolu généré côté serveur :
// redirection auth (confirmation signup, reset password), callback Flouci,
// lien de partage (parrainage, demande Jibli), sitemap/robots.
//
// NEXT_PUBLIC_SITE_URL doit être configurée dans Vercel (Production ET
// Preview — .env.local ne s'applique qu'en local). Si elle manque, le
// fallback pointe vers le vrai domaine de prod plutôt que localhost:3000 :
// avant ce fichier, chacun des 7 appelants dupliquait
// `?? 'http://localhost:3000'`, ce qui envoyait de vrais liens de prod
// (emails de confirmation, reset password, callback Flouci, lien de
// parrainage) vers localhost dès que la variable n'était pas configurée sur
// Vercel — bug constaté en direct sur /parrainage.
export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://livrily-v2.vercel.app'
}
