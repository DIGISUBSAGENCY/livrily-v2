import Link from 'next/link'
import { Mail, Phone, Music2 } from 'lucide-react'
import { FacebookIcon, InstagramIcon } from '@/components/layout/SocialIcons'

// Coordonnées et réseaux sociaux réels à renseigner ici une fois connus.
// Volontairement vides pour l'instant plutôt que remplis avec des valeurs
// plausibles mais inventées : un email/téléphone affiché doit être réel, pas
// une supposition qui risquerait d'être publiée telle quelle.
const CONTACT_EMAIL = ''
const CONTACT_PHONE = ''

const SOCIAL_LINKS = {
  facebook: '#',
  instagram: '#',
  tiktok: '#',
}

const quickLinks = [
  { href: '/jibli', label: 'Demandes' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/parrainage', label: 'Parrainage' },
]

const legalLinks = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/cgv', label: 'CGV' },
  { href: '/confidentialite', label: 'Politique de confidentialité' },
]

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-lg font-bold tracking-tight text-brand-700">Livrily</p>
            <p className="mt-2 max-w-xs text-sm text-slate-500">
              Courses du quotidien et objets ramenés de l&apos;étranger, livrés en toute
              sécurité en Tunisie.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href={SOCIAL_LINKS.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-slate-400 transition-colors hover:text-brand-700"
              >
                <FacebookIcon className="h-5 w-5" />
              </a>
              <a
                href={SOCIAL_LINKS.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-slate-400 transition-colors hover:text-brand-700"
              >
                <InstagramIcon className="h-5 w-5" />
              </a>
              <a
                href={SOCIAL_LINKS.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
                className="text-slate-400 transition-colors hover:text-brand-700"
              >
                <Music2 className="h-5 w-5" aria-hidden />
              </a>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Liens rapides</p>
            <ul className="mt-3 space-y-2">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-500 transition-colors hover:text-brand-700">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Contact</p>
            <ul className="mt-3 space-y-2">
              {CONTACT_EMAIL && (
                <li>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-brand-700"
                  >
                    <Mail className="h-4 w-4 flex-shrink-0" aria-hidden />
                    {CONTACT_EMAIL}
                  </a>
                </li>
              )}
              {CONTACT_PHONE && (
                <li>
                  <a
                    href={`tel:${CONTACT_PHONE}`}
                    className="flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-brand-700"
                  >
                    <Phone className="h-4 w-4 flex-shrink-0" aria-hidden />
                    {CONTACT_PHONE}
                  </a>
                </li>
              )}
              {!CONTACT_EMAIL && !CONTACT_PHONE && (
                <li className="text-sm text-slate-400">Coordonnées à venir.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-6 sm:flex-row">
          <p className="text-xs text-slate-400">© Livrily {new Date().getFullYear()}. Tous droits réservés.</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-xs text-slate-400 transition-colors hover:text-brand-700">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
