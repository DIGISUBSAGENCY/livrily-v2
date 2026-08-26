import Link from 'next/link'
import { Plane, ShieldCheck, UserCheck, LifeBuoy, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TravelRequestCarousel } from '@/components/home/TravelRequestCarousel'
import { getTravelTrend, type TravelTrend } from '@/lib/travel/getTravelTrend'

// Badges de confiance : uniquement des affirmations vraies sur la
// plateforme telle qu'elle existe aujourd'hui. "Commerces vérifiés" et
// "Suivi en temps réel" (position GPS livreur) ont disparu avec le rôle
// commerce — remplacés par 2 points réels du modèle Jibli (KYC obligatoire,
// litiges pris en charge).
const trustBadges = [
  {
    icon: ShieldCheck,
    title: 'Paiement sécurisé',
    description: "L'argent reste séquestré et n'est versé au voyageur qu'à la réception confirmée.",
  },
  {
    icon: UserCheck,
    title: 'Identité vérifiée',
    description: 'Client et voyageur confirment leur identité (~2 min) avant toute transaction réelle.',
  },
  {
    icon: LifeBuoy,
    title: 'Litiges pris en charge',
    description: "En cas de désaccord, l'équipe Livrily intervient et tranche.",
  },
]

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // membersCount via get_platform_member_count() : profiles n'est pas
  // lisible par un visiteur anonyme (profiles_select_own_or_admin, cf.
  // schema.sql) — un select count direct renvoyait toujours 0 pour
  // n'importe qui hors session, bug trouvé et vérifié en direct.
  const [{ count: openRequests }, { data: membersCount }, { data: latestRequests }] = await Promise.all([
    supabase.from('travel_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.rpc('get_platform_member_count'),
    supabase.from('travel_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(10),
  ])

  const stats = [
    { label: 'Demandes de voyage ouvertes', value: openRequests ?? 0 },
    { label: 'Membres Livrily', value: membersCount ?? 0 },
  ]

  // Propositions du voyageur courant sur les demandes du carousel — même
  // logique que /jibli, pour la même raison (RLS : il ne peut de toute
  // façon pas voir celles des autres voyageurs), cf. RequestCard. Objet
  // simple (pas une Map) : ce prop traverse la frontière Server → Client
  // Component vers TravelRequestCarousel, autant rester sur un type
  // trivialement sérialisable.
  const ownProposalsByRequest: Record<string, { item_price: number; delivery_fee: number }> = {}
  if (user && latestRequests && latestRequests.length > 0) {
    const { data: ownProposals } = await supabase
      .from('travel_proposals')
      .select('request_id, item_price, delivery_fee')
      .eq('voyageur_id', user.id)
      .in('request_id', latestRequests.map((r) => r.id))

    for (const p of ownProposals ?? []) {
      ownProposalsByRequest[p.request_id] = { item_price: p.item_price, delivery_fee: p.delivery_fee }
    }
  }

  // Indicateur tendance 🔥/❄️ : un visiteur public ne peut pas lire
  // travel_proposals directement (RLS, propositions privées) — passe par
  // un RPC agrégat (compteurs uniquement, cf. schema.sql) plutôt que
  // d'exposer les lignes individuelles.
  const trendByRequest: Record<string, TravelTrend> = {}
  if (latestRequests && latestRequests.length > 0) {
    const { data: engagement } = await supabase.rpc('get_travel_request_engagement', {
      p_request_ids: latestRequests.map((r) => r.id),
    })
    const engagementByRequest = new Map(
      (engagement ?? []).map((e) => [e.request_id, { total: e.total_proposals, recent: e.recent_proposals }])
    )
    for (const request of latestRequests) {
      const stats = engagementByRequest.get(request.id) ?? { total: 0, recent: 0 }
      trendByRequest[request.id] = getTravelTrend(request.created_at, stats.total, stats.recent)
    }
  }

  return (
    <main>
      {/* ---------------------------------------------------------------- */}
      {/* Hero — deux parcours clairs dès l'arrivée                        */}
      {/* ---------------------------------------------------------------- */}
      {/* pb-24/-mb-16 : le panneau stats déborde volontairement sous le
          dégradé (cf. plus bas) — remplace l'ancienne grille de 2 Card qui
          flottait sans ancrage entre le hero et la section suivante. */}
      <section className="bg-gradient-to-b from-brand-50 to-white px-4 pb-24 pt-16 sm:pb-28 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft ring-1 ring-brand-100">
            <Plane className="h-3.5 w-3.5" aria-hidden />
            Crowd-shipping vers la Tunisie
          </span>
          <h1 className="mt-4 text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            Fais-toi ramener un objet de l&apos;étranger
          </h1>
          <p className="mx-auto mt-4 max-w-md text-lg text-slate-600">
            Demande à un voyageur de te le ramener, ou rentabilise ton prochain voyage en le
            ramenant toi-même — paiement sécurisé, en séquestre jusqu&apos;à réception.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/jibli/nouvelle-demande">
              <Button size="lg">
                <Plane className="h-4 w-4" aria-hidden />
                Publier une demande
              </Button>
            </Link>
            <Link href="/jibli">
              {/* variant="outline" (v3) : formalise l'ancien override
                  local — contour brand, distinction nette avec le CTA
                  primaire plein. */}
              <Button variant="outline" size="lg">
                <Wallet className="h-4 w-4" aria-hidden />
                Devenir voyageur
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats — un seul panneau uni (pas 2 Card séparées) : séparateur
            interne, ombre marquée, léger débordement sur la transition
            dégradé→blanc pour un ancrage plus intentionnel. */}
        <div className="relative z-10 mx-auto -mb-16 mt-14 max-w-xl overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-soft-lg sm:-mb-20">
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {stats.map((stat) => (
              <div key={stat.label} className="px-6 py-6 text-center">
                <p className="text-3xl font-bold text-brand-700">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Carousel — dernières demandes de voyage ouvertes                 */}
      {/* ---------------------------------------------------------------- */}
      {/* Pas de border-t (contrairement aux sections suivantes) : le
          panneau stats du hero déborde jusqu'ici (cf. -mb-16/-mb-20
          ci-dessus), un hairline juste en dessous ferait doublon avec sa
          propre bordure/ombre. pt généreux pour garantir un dégagement net
          sous le panneau, quelle que soit sa hauteur exacte. */}
      <section className="px-4 pb-20 pt-28 sm:pb-24 sm:pt-32">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Dernières demandes de voyage</h2>
              <p className="mt-1 text-sm text-slate-500">
                Publiées par nos membres, en attente d&apos;un voyageur.
              </p>
            </div>
            <Link href="/jibli" className="hidden flex-shrink-0 text-sm font-medium text-brand-600 hover:underline sm:inline-block">
              Voir toutes les demandes →
            </Link>
          </div>

          <div className="mt-6">
            <TravelRequestCarousel
              requests={latestRequests ?? []}
              ownProposalsByRequest={ownProposalsByRequest}
              trendByRequest={trendByRequest}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Badges de confiance                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-slate-100 bg-slate-50 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-5xl text-center">
          {/* Eyebrow — même pattern que le hero et la section voyageurs
              ci-dessous, répété plutôt que 3 traitements de titre
              différents sur la page. */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow-soft ring-1 ring-brand-100">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            De l&apos;argent en jeu, en toute confiance
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Pourquoi nous faire confiance</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {trustBadges.map((badge) => (
              <Card key={badge.title} interactive className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 ring-4 ring-brand-50/60">
                  <badge.icon className="h-7 w-7 text-brand-600" aria-hidden />
                </div>
                <p className="mt-5 text-lg font-semibold text-slate-900">{badge.title}</p>
                <p className="mt-1.5 text-sm text-slate-500">{badge.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Section dédiée voyageurs                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-slate-100 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Pour les voyageurs
          </span>
          <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-slate-900">
            Tu voyages bientôt ? Rentabilise ton trajet.
          </h2>
          <p className="mt-4 text-slate-600">
            Parcours les demandes ouvertes vers ta destination, propose ton prix pour ramener
            l&apos;objet, et sois payé en toute sécurité dès que le client confirme la réception.
          </p>
          <div className="mt-6">
            <Link href="/jibli">
              <Button size="lg">
                <Plane className="h-4 w-4" aria-hidden />
                Voir les demandes à pourvoir
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
