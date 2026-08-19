import Link from 'next/link'
import { ShoppingBag, Plane, ShieldCheck, Store, Radar, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TravelRequestCarousel } from '@/components/home/TravelRequestCarousel'
import { getTravelTrend, type TravelTrend } from '@/lib/travel/getTravelTrend'

// Badges de confiance : uniquement des affirmations vraies sur la
// plateforme telle qu'elle existe aujourd'hui (pas de vérification
// d'identité construite — donc pas de badge "utilisateurs vérifiés").
const trustBadges = [
  {
    icon: ShieldCheck,
    title: 'Paiement sécurisé',
    description: "L'argent reste séquestré et n'est versé au voyageur qu'à la réception confirmée.",
  },
  {
    icon: Store,
    title: 'Commerces vérifiés',
    description: 'Chaque commerce partenaire est ajouté et contrôlé par l\'équipe Livrily, pas en libre-service.',
  },
  {
    icon: Radar,
    title: 'Suivi en temps réel',
    description: 'Position du livreur en direct sur la carte pendant toute la livraison.',
  },
]

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ count: activeCommerces }, { count: openRequests }, { count: membersCount }, { data: latestRequests }] =
    await Promise.all([
      supabase.from('commerces').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('travel_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
      supabase.from('travel_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(10),
    ])

  const stats = [
    { label: 'Commerces actifs', value: activeCommerces ?? 0 },
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
      <section className="bg-gradient-to-b from-brand-50 to-white px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Tes courses livrées, tes envies ramenées de l&apos;étranger
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Commande chez tes commerçants du quotidien, ou fais-toi ramener un objet par un
            voyageur — paiement sécurisé, suivi en direct.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/commerces">
              <Button size="lg">
                <ShoppingBag className="h-4 w-4" aria-hidden />
                Commander
              </Button>
            </Link>
            <Link href="/jibli">
              <Button variant="secondary" size="lg">
                <Plane className="h-4 w-4" aria-hidden />
                Devenir voyageur
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats ------------------------------------------------------- */}
        <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Carousel — dernières demandes de voyage ouvertes                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-slate-100 px-4 py-16">
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
      <section className="border-t border-slate-100 bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900">Pourquoi nous faire confiance</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {trustBadges.map((badge) => (
              <Card key={badge.title} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                  <badge.icon className="h-6 w-6 text-brand-600" aria-hidden />
                </div>
                <p className="mt-4 font-semibold text-slate-900">{badge.title}</p>
                <p className="mt-1 text-sm text-slate-500">{badge.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Section dédiée voyageurs                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-slate-100 px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Pour les voyageurs
          </span>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
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
