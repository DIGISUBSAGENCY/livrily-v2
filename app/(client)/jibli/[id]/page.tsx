import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { TravelRequestStatusBadge } from '@/components/travel/TravelRequestStatusBadge'
import { TravelPaymentStatusBadge } from '@/components/travel/TravelPaymentStatusBadge'
import { ProposalCard } from '@/components/travel/ProposalCard'
import { ProposalForm } from '@/components/travel/ProposalForm'
import { VoyageurStatusActions } from '@/components/travel/VoyageurStatusActions'
import { ConfirmReceiptButton } from '@/components/travel/ConfirmReceiptButton'
import { CancelRequestButton } from '@/components/travel/CancelRequestButton'
import { MissionInfoGrid } from '@/components/travel/MissionInfoGrid'
import { VoyageurGainCard } from '@/components/travel/VoyageurGainCard'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getPublicStorageUrl } from '@/lib/storage'
import { pageMetadata } from '@/lib/seo'
import { estimateSuggestedGain, actualGainFromProposal } from '@/lib/travel/estimateGain'
import { getIdentityStatus, type IdentityGateStatus } from '@/lib/identity'
import type { BankTransferInfo, TravelPayment, TravelProposal, TravelProposalOffer } from '@/types/database'

interface TravelRequestPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ flouci?: string }>
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

// Consultation publique (comme /commerces/[id]) : pas de redirection si
// non connecté, seules les actions (proposer, accepter, annuler...) sont
// réservées aux comptes authentifiés, via les Server Actions + RLS.
export default async function TravelRequestPage({ params, searchParams }: TravelRequestPageProps) {
  const { id } = await params
  const { flouci } = await searchParams
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
  let myProposal: TravelProposal | null = null
  let payment: TravelPayment | null = null
  let bankInfo: PlatformPaymentInfo | null = null
  const offersByProposal = new Map<string, TravelProposalOffer[]>()
  let clientName: string | null = null
  let ownerIdentityStatus: IdentityGateStatus | null = null

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
  const canConfirmReceipt = isOwner && request.status === 'completed' && !request.client_confirmed_at
  const flouciBanner = flouci ? flouciBannerMessages[flouci] : null

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

      {request.item_photo_url && (
        // eslint-disable-next-line @next/next/no-img-element -- photo utilisateur, provenance variable
        <img
          src={getPublicStorageUrl('travel-request-photos', request.item_photo_url)}
          alt={request.item_description}
          className="mt-4 max-h-72 w-full rounded-lg object-cover"
        />
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

      {canConfirmReceipt && (
        <Card className="mt-4">
          <h2 className="mb-2 font-semibold text-slate-900">Réception</h2>
          <p className="mb-3 text-sm text-slate-600">
            Le voyageur a marqué l&apos;objet comme remis. Confirme si tu l&apos;as bien reçu — ça
            libère le paiement.
          </p>
          <ConfirmReceiptButton requestId={request.id} />
        </Card>
      )}

      {isAcceptedVoyageur && (
        <Card className="mt-4">
          <h2 className="mb-3 font-semibold text-slate-900">Suivi de la mission</h2>
          <VoyageurStatusActions requestId={request.id} status={request.status} />
        </Card>
      )}

      {isOwner && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold text-slate-900">
            Propositions reçues {proposals.length > 0 && `(${proposals.length})`}
          </h2>
          {proposals.length === 0 && (
            <p className="text-sm text-slate-500">Aucune proposition pour l&apos;instant.</p>
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
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-slate-900">Faire une proposition</h2>
          <ProposalForm requestId={request.id} />
        </Card>
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
