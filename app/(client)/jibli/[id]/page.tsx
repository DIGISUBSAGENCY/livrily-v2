import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ExternalLink, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { TravelPaymentStatusBadge } from '@/components/travel/TravelPaymentStatusBadge'
import { ResubmitPaymentProof } from '@/components/travel/ResubmitPaymentProof'
import { ProposalCard } from '@/components/travel/ProposalCard'
import { ProposalForm } from '@/components/travel/ProposalForm'
import { VoyageurStatusActions } from '@/components/travel/VoyageurStatusActions'
import { ConfirmReceiptButton } from '@/components/travel/ConfirmReceiptButton'
import { CancelRequestButton } from '@/components/travel/CancelRequestButton'
import { TripMatchesPanel } from '@/components/travel/TripMatchesPanel'
import { MissionInfoGrid } from '@/components/travel/MissionInfoGrid'
import { VoyageurGainCard } from '@/components/travel/VoyageurGainCard'
import { RequestPhotoPlaceholder } from '@/components/travel/RequestPhotoPlaceholder'
import { DisputeForm } from '@/components/travel/DisputeForm'
import { ReviewForm } from '@/components/travel/ReviewForm'
import { IdentityRequiredModal } from '@/components/account/IdentityRequiredModal'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StarRating } from '@/components/ui/StarRating'
import { getPublicStorageUrl } from '@/lib/storage'
import { pageMetadata } from '@/lib/seo'
import { estimateSuggestedGain, actualGainFromProposal } from '@/lib/travel/estimateGain'
import { getIdentityStatus, type IdentityGateStatus } from '@/lib/identity'
import { getProfileRating, type ProfileRating } from '@/lib/reviews'
import { getTrustScore, type TrustCategory } from '@/lib/trust'
import type { BankTransferInfo, TravelPayment, TravelProposal, TravelProposalOffer, TravelReview } from '@/types/database'

interface TravelRequestPageProps {
  params: Promise<{ id: string }>
  // trip_id : pré-remplissage de ProposalForm depuis "Proposer" sur un
  // match Trips (RequestMatchCard, page trip). Revérifié côté serveur
  // avant d'être réellement lié (cf. createProposal) — un id invalide/pas
  // le sien ici n'affiche juste pas de pré-remplissage, sans erreur.
  searchParams: Promise<{ flouci?: string; trip_id?: string }>
}

export async function generateMetadata({ params }: TravelRequestPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: request } = await supabase
    .from('travel_requests')
    .select('item_description, origin_country, destination_city, budget_max')
    .eq('id', id)
    .single()

  if (!request) {
    return pageMetadata({ title: 'Demande introuvable', description: 'Cette demande de voyage est introuvable.' })
  }

  return pageMetadata({
    title: request.item_description,
    description: `${request.origin_country} → ${request.destination_city} · Budget jusqu'à ${request.budget_max} DT. Propose de ramener cet objet sur Livrily.`,
  })
}

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib' | 'flouci_phone'>

const flouciBannerMessages: Record<string, { text: string; tone: string }> = {
  success: { text: 'Paiement Flouci confirmé — proposition acceptée et fonds séquestrés.', tone: 'bg-brand-50 text-brand-700 border-brand-200' },
  failed: { text: 'Le paiement Flouci a échoué ou a été annulé.', tone: 'bg-red-50 text-red-700 border-red-200' },
  orphaned: {
    text: "Ton paiement Flouci a été confirmé mais l'acceptation a échoué (demande peut-être modifiée entre-temps). Contacte le support pour un remboursement.",
    tone: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  error: { text: "Une erreur est survenue pendant la vérification du paiement Flouci.", tone: 'bg-red-50 text-red-700 border-red-200' },
}

// Consultation publique : pas de redirection si non connecté, seules les
// actions (proposer, accepter, annuler...) sont réservées aux comptes
// authentifiés, via les Server Actions + RLS.
export default async function TravelRequestPage({ params, searchParams }: TravelRequestPageProps) {
  const { id } = await params
  const { flouci, trip_id: tripId } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: request, error } = await supabase.from('travel_requests').select('*').eq('id', id).single()

  if (error || !request) {
    notFound()
  }

  const isOwner = user?.id === request.client_id

  let profileRole: string | null = null
  let proposals: TravelProposal[] = []
  let voyageurNames = new Map<string, string>()
  let voyageurVerified = new Map<string, boolean>()
  let voyageurRatings = new Map<string, ProfileRating>()
  let voyageurTrustCategories = new Map<string, TrustCategory>()
  let myProposal: TravelProposal | null = null
  let payment: TravelPayment | null = null
  let bankInfo: PlatformPaymentInfo | null = null
  const offersByProposal = new Map<string, TravelProposalOffer[]>()
  let clientName: string | null = null
  let ownerIdentityStatus: IdentityGateStatus | null = null
  let voyageurIdentityStatus: IdentityGateStatus | null = null

  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    profileRole = profile?.role ?? null

    if (isOwner) {
      // Barre de progression KYC affichée avant/à la place du paiement
      // (acceptProposalVirement/initiateFlouciPayment sont gatées — cf.
      // [id]/actions.ts) plutôt que de laisser le client échouer une
      // soumission pour découvrir qu'il doit d'abord se vérifier.
      ownerIdentityStatus = await getIdentityStatus(supabase, user.id)
      const { data } = await supabase
        .from('travel_proposals')
        .select('*')
        .eq('request_id', id)
        .order('created_at', { ascending: false })
      proposals = data ?? []

      const voyageurIds = Array.from(new Set(proposals.map((p) => p.voyageur_id)))
      if (voyageurIds.length > 0) {
        const { data: voyageurProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', voyageurIds)
        voyageurNames = new Map((voyageurProfiles ?? []).map((p) => [p.id, p.full_name ?? 'Voyageur']))

        // Badge "Voyageur vérifié" — la ligne identity_verifications reste
        // privée (RLS), ce RPC n'expose qu'un booléen par voyageur.
        const verifiedEntries = await Promise.all(
          voyageurIds.map(async (voyageurId) => {
            const { data } = await supabase.rpc('is_identity_verified', { p_profile_id: voyageurId })
            return [voyageurId, data === true] as const
          })
        )
        voyageurVerified = new Map(verifiedEntries)

        // Note publique de chaque voyageur (get_profile_rating, jamais le
        // contenu des avis) — aide le client à comparer ses propositions.
        const ratingEntries = await Promise.all(
          voyageurIds.map(async (voyageurId) => [voyageurId, await getProfileRating(supabase, voyageurId)] as const)
        )
        voyageurRatings = new Map(ratingEntries)

        // Catégorie Trust Score de chaque voyageur (get_trust_score, jamais
        // le score brut) — même logique que voyageurVerified/voyageurRatings
        // ci-dessus, aide le client à comparer ses propositions.
        const trustEntries = await Promise.all(
          voyageurIds.map(async (voyageurId) => [voyageurId, (await getTrustScore(supabase, voyageurId)).category] as const)
        )
        voyageurTrustCategories = new Map(trustEntries)
      }

      // Historique de négociation de chaque fil (une seule requête groupée,
      // plutôt qu'une par proposition).
      if (proposals.length > 0) {
        const { data: offersData } = await supabase
          .from('travel_proposal_offers')
          .select('*')
          .in('proposal_id', proposals.map((p) => p.id))
          .order('created_at', { ascending: true })
        for (const offer of offersData ?? []) {
          const list = offersByProposal.get(offer.proposal_id) ?? []
          list.push(offer)
          offersByProposal.set(offer.proposal_id, list)
        }
      }

      if (request.status === 'open') {
        const { data: activeBankInfo } = await supabase
          .from('bank_transfer_info')
          .select('bank_name, account_holder, rib, flouci_phone')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()
        bankInfo = activeBankInfo
      }
    } else {
      // Même barre/modal KYC que côté client (createProposal est
      // désormais gatée, cf. actions.ts) — récupéré même si canPropose
      // s'avère faux plus bas (myProposal déjà posée, etc.), coût
      // négligeable, évite un second aller-retour conditionnel.
      voyageurIdentityStatus = await getIdentityStatus(supabase, user.id)

      const { data } = await supabase
        .from('travel_proposals')
        .select('*')
        .eq('request_id', id)
        .eq('voyageur_id', user.id)
        .maybeSingle()
      myProposal = data ?? null

      if (myProposal) {
        const [{ data: offersData }, { data: clientProfile }] = await Promise.all([
          supabase
            .from('travel_proposal_offers')
            .select('*')
            .eq('proposal_id', myProposal.id)
            .order('created_at', { ascending: true }),
          // RLS profiles_select_travel_counterparties : visible seulement
          // parce qu'un fil de négociation existe déjà entre les deux.
          supabase.from('profiles').select('full_name').eq('id', request.client_id).single(),
        ])
        offersByProposal.set(myProposal.id, offersData ?? [])
        clientName = clientProfile?.full_name ?? null
      }
    }

    // Visible par le client propriétaire et par le voyageur accepté (RLS).
    if (request.status !== 'open') {
      const { data: paymentData } = await supabase
        .from('travel_payments')
        .select('*')
        .eq('request_id', id)
        .maybeSingle()
      payment = paymentData ?? null
    }
  }

  const isAcceptedVoyageur = !isOwner && myProposal?.status === 'accepted'
  const canPropose = !!user && !isOwner && request.status === 'open' && !myProposal && profileRole === 'client'
  const mustLoginToPropose = !user && request.status === 'open'

  // Trips (Phase 3, brique 2/N) — pré-remplissage depuis "Proposer" sur un
  // match (RequestMatchCard, page trip). Uniquement affiché si CE trip
  // appartient bien à l'utilisateur courant (RLS filtre déjà, revérifié
  // explicitement ici pour ne montrer le pré-remplissage que quand il a un
  // sens) — createProposal revalide indépendamment côté serveur avant de
  // lier réellement le trip, ceci n'est que l'affichage.
  let sourceTrip: { id: string; indicative_price: number | null; pickup_city: string | null } | null = null
  if (canPropose && tripId) {
    const { data: tripData } = await supabase
      .from('trips')
      .select('id, indicative_price, pickup_city')
      .eq('id', tripId)
      .eq('voyageur_id', user!.id)
      .eq('status', 'open')
      .maybeSingle()
    sourceTrip = tripData ?? null
  }
  const canConfirmReceipt = isOwner && request.status === 'completed' && !request.client_confirmed_at
  const flouciBanner = flouci ? flouciBannerMessages[flouci] : null
  // Un litige n'a de sens qu'une fois une transaction engagée (proposition
  // acceptée) — pas sur une demande encore 'open' sans personne en face.
  const canDispute = (isOwner || isAcceptedVoyageur) && request.status !== 'open'
  // Même gate que la policy RLS travel_reviews_insert_involved côté
  // affichage : client_confirmed_at (pas juste status='completed') prouve
  // que la transaction est réellement allée au bout.
  const canReview = (isOwner || isAcceptedVoyageur) && request.client_confirmed_at !== null

  let myReview: TravelReview | null = null
  if (canReview && user) {
    const { data } = await supabase
      .from('travel_reviews')
      .select('*')
      .eq('travel_request_id', id)
      .eq('reviewer_id', user.id)
      .maybeSingle()
    myReview = data ?? null
  }

  // Transparence sur la libération automatique (auto_release_stale_payments,
  // schema.sql) : affichée aux deux parties tant que le client n'a pas
  // confirmé et qu'aucun litige n'est ouvert — même gate que la fonction
  // SQL, recalculée ici uniquement pour l'affichage (aucune action, la
  // vraie décision reste côté base).
  let autoReleaseDate: Date | null = null
  if ((isOwner || isAcceptedVoyageur) && request.status === 'completed' && !request.client_confirmed_at && request.completed_at) {
    const [{ data: platformSettings }, { data: openDispute }] = await Promise.all([
      supabase.from('platform_settings').select('auto_release_delay_days').eq('id', true).single(),
      supabase.from('disputes').select('id').eq('travel_request_id', id).eq('status', 'open').maybeSingle(),
    ])
    if (!openDispute) {
      const delayDays = platformSettings?.auto_release_delay_days ?? 7
      autoReleaseDate = new Date(new Date(request.completed_at).getTime() + delayDays * 24 * 60 * 60 * 1000)
    }
  }

  // Montants réels dès qu'une proposition concrète existe (celle acceptée
  // pour le client propriétaire, la sienne pour un voyageur) — sinon
  // estimation dérivée du budget, jamais un montant fixé par la
  // plateforme : la récompense est proposée par le voyageur puis acceptée
  // par le client (cf. ProposalForm/createProposal).
  const acceptedProposal = isOwner ? (proposals.find((p) => p.id === request.accepted_proposal_id) ?? null) : null
  const rewardBasis =
    isOwner && acceptedProposal
      ? { itemPrice: acceptedProposal.item_price, deliveryFee: acceptedProposal.delivery_fee }
      : !isOwner && myProposal
        ? { itemPrice: myProposal.item_price, deliveryFee: myProposal.delivery_fee }
        : null
  const gain = rewardBasis
    ? actualGainFromProposal(rewardBasis.itemPrice, rewardBasis.deliveryFee)
    : estimateSuggestedGain(request.budget_max)
  // Carte détaillée réservée au voyageur (prospectif ou avec proposition) —
  // le client voit déjà le détail de chaque proposition via ProposalCard.
  const showVoyageurGainCard = !isOwner
  const otherPartyNameForReview = isOwner
    ? (voyageurNames.get(acceptedProposal?.voyageur_id ?? '') ?? 'le voyageur')
    : (clientName ?? 'le client')

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Jibli chay men l&apos;a5er
      </Link>

      {flouciBanner && (
        <div className={`mt-4 rounded-lg border p-3 text-sm ${flouciBanner.tone}`}>{flouciBanner.text}</div>
      )}

      <div className="mt-3 flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{request.item_description}</h1>
        <TravelRequestStatusBadge status={request.status} />
      </div>

      {payment && (
        <div className="mt-2">
          <TravelPaymentStatusBadge status={payment.status} />
        </div>
      )}

      {/* Re-soumission de preuve après rejet admin (chantier admin
          completeness, Option B) — propriétaire uniquement, paiement
          virement rejeté uniquement. La RPC revérifie ces conditions côté
          base, ce gate n'est que de l'affichage. */}
      {isOwner && payment?.status === 'rejected' && payment.payment_method === 'virement' && (
        <ResubmitPaymentProof requestId={request.id} />
      )}

      {request.item_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- photo utilisateur, provenance variable
        <img
          src={getPublicStorageUrl('travel-request-photos', request.item_photo_url)}
          alt={request.item_description}
          className="mt-4 max-h-72 w-full rounded-lg object-cover"
        />
      ) : (
        <RequestPhotoPlaceholder className="mt-4 h-48 w-full rounded-lg" iconClassName="h-12 w-12" />
      )}

      {request.item_url && (
        <a
          href={request.item_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          Voir la fiche produit
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}

      <div className="mt-4">
        <MissionInfoGrid
          originCountry={request.origin_country}
          destinationCity={request.destination_city}
          neededBy={request.needed_by}
          budgetMax={request.budget_max}
          rewardBasis={rewardBasis}
          gain={gain}
        />
      </div>

      {showVoyageurGainCard && (
        <div className="mt-4">
          <VoyageurGainCard rewardBasis={rewardBasis} gain={gain} />
        </div>
      )}

      {isOwner && request.status === 'open' && (
        <div className="mt-4">
          <CancelRequestButton requestId={request.id} />
        </div>
      )}

      {isOwner && request.status === 'open' && <TripMatchesPanel requestId={request.id} />}

      {canConfirmReceipt && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold text-slate-900">Réception</h2>
          <p className="mb-3 text-sm text-slate-600">
            Le voyageur a marqué l&apos;objet comme remis. Confirme si tu l&apos;as bien reçu — ça
            libère le paiement.
          </p>
          {autoReleaseDate && (
            <p className="mb-3 text-xs text-slate-400">
              Si tu ne confirmes pas et qu&apos;aucun litige n&apos;est ouvert, les fonds seront
              automatiquement libérés au voyageur le {autoReleaseDate.toLocaleDateString('fr-TN')}.
            </p>
          )}
          <ConfirmReceiptButton requestId={request.id} />
        </Card>
      )}

      {isAcceptedVoyageur && (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold text-slate-900">Suivi de la mission</h2>
          <VoyageurStatusActions requestId={request.id} status={request.status} />
          {autoReleaseDate && (
            <p className="mt-3 text-xs text-slate-400">
              En attente de confirmation du client. Si aucun litige n&apos;est ouvert, les fonds
              séquestrés te seront automatiquement libérés le{' '}
              {autoReleaseDate.toLocaleDateString('fr-TN')} même sans confirmation.
            </p>
          )}
        </Card>
      )}

      {canDispute && (
        <div className="mt-4">
          <DisputeForm requestId={request.id} />
        </div>
      )}

      {canReview && (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold text-slate-900">Avis</h2>
          {myReview ? (
            <div>
              <StarRating value={myReview.rating} size="sm" />
              {myReview.comment && <p className="mt-2 text-sm text-slate-600">{myReview.comment}</p>}
              <p className="mt-2 text-xs text-slate-400">Ton avis a été envoyé, merci !</p>
            </div>
          ) : (
            <ReviewForm requestId={request.id} otherPartyName={otherPartyNameForReview} />
          )}
        </Card>
      )}

      {isOwner && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold text-slate-900">
            Propositions reçues {proposals.length > 0 && `(${proposals.length})`}
          </h2>
          {proposals.length === 0 && (
            <EmptyState icon={Inbox} className="mt-6">
              <p>Aucune proposition pour l&apos;instant.</p>
            </EmptyState>
          )}
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                offers={offersByProposal.get(proposal.id) ?? []}
                requestId={request.id}
                requestStatus={request.status}
                otherPartyName={voyageurNames.get(proposal.voyageur_id) ?? 'Voyageur'}
                viewerRole="owner"
                bankInfo={bankInfo}
                voyageurVerified={voyageurVerified.get(proposal.voyageur_id) ?? false}
                identityStatus={ownerIdentityStatus}
                voyageurRating={voyageurRatings.get(proposal.voyageur_id) ?? null}
                voyageurTrustCategory={voyageurTrustCategories.get(proposal.voyageur_id) ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {!isOwner && myProposal && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold text-slate-900">Ta proposition</h2>
          <ProposalCard
            proposal={myProposal}
            offers={offersByProposal.get(myProposal.id) ?? []}
            requestId={request.id}
            requestStatus={request.status}
            otherPartyName={clientName ?? 'Le client'}
            viewerRole="voyageur"
          />
        </div>
      )}

      {canPropose && (
        <>
          <IdentityRequiredModal
            defaultOpen={voyageurIdentityStatus === 'unverified' || voyageurIdentityStatus === 'rejected'}
          />
          <Card className="mt-6">
            <h2 className="mb-3 font-semibold text-slate-900">Faire une proposition</h2>
            {/*
              key=sourceTrip?.id : Next.js ne démonte PAS l'arbre de
              composants d'une page quand seuls les searchParams changent
              (même pathname) — sans ce key, ProposalForm réutilise son
              instance déjà montée lors d'une navigation client-side
              antérieure sur CETTE MÊME page sans ?trip_id=, et
              useState(defaultDeliveryFee ?? 0) n'étant lu qu'au tout
              premier montage, le nouveau pré-remplissage n'est jamais
              appliqué (bug reproduit en direct : HTML serveur correct à
              chaque fois, mais navigation client-side réelle affichait un
              formulaire vide). Forcer un remount à chaque trip_id
              différent — pattern React documenté pour "reset state when a
              prop changes".
            */}
            <ProposalForm
              key={sourceTrip?.id ?? 'no-trip'}
              requestId={request.id}
              sourceTripId={sourceTrip?.id}
              defaultDeliveryFee={sourceTrip?.indicative_price ?? undefined}
              defaultPickupCity={sourceTrip?.pickup_city ?? undefined}
            />
          </Card>
        </>
      )}

      {mustLoginToPropose && (
        <Card className="mt-6 text-center">
          <p className="text-sm text-slate-600">Connecte-toi pour proposer de ramener cet objet.</p>
          <Link href={`/login?next=/jibli/${request.id}`}>
            <Button size="sm" className="mt-3">
              Se connecter
            </Button>
          </Link>
        </Card>
      )}

      {!isOwner && user && !myProposal && request.status !== 'open' && (
        <p className="mt-6 text-sm text-slate-500">Cette demande n&apos;est plus ouverte aux propositions.</p>
      )}
    </main>
  )
}
