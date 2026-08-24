import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductOfferStatusBadge } from '@/components/travel/ProductOfferStatusBadge'
import { TakeProductOfferPayment } from '@/components/travel/TakeProductOfferPayment'
import { CancelOfferButton } from '@/components/travel/CancelOfferButton'
import { BoostBadge, isBoosted } from '@/components/travel/BoostBadge'
import { BoostPayment } from '@/components/travel/BoostPayment'
import { TrustCategoryBadge } from '@/components/profile/TrustCategoryBadge'
import { IdentityProgressBar } from '@/components/account/IdentityProgressBar'
import { RequestPhotoPlaceholder } from '@/components/travel/RequestPhotoPlaceholder'
import { Card } from '@/components/ui/Card'
import { getPublicStorageUrl } from '@/lib/storage'
import { formatTND } from '@/lib/format'
import { pageMetadata } from '@/lib/seo'
import { getIdentityStatus } from '@/lib/identity'
import { getTrustScore } from '@/lib/trust'
import type { BankTransferInfo, BoostPricingTier } from '@/types/database'

type PlatformPaymentInfo = Pick<BankTransferInfo, 'bank_name' | 'account_holder' | 'rib' | 'flouci_phone'>
// Forme renvoyée par get_boost_pricing_tiers() (RPC), pas la ligne de table
// complète (pas de updated_at/updated_by ici).
type BoostTier = Pick<BoostPricingTier, 'duration_days' | 'price_tnd'>

interface ProductOfferPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProductOfferPageProps): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: offer } = await supabase
    .from('product_offers')
    .select('item_description, origin_country, destination_city, item_price, delivery_fee')
    .eq('id', id)
    .single()

  if (!offer) {
    return pageMetadata({ title: 'Offre introuvable', description: 'Cette offre est introuvable.' })
  }

  return pageMetadata({
    title: offer.item_description,
    description: `${offer.origin_country} → ${offer.destination_city} · ${formatTND(offer.item_price + offer.delivery_fee)}. Prends cette offre directement sur Livrily.`,
  })
}

// Fiche détail — pas de négociation ici (contrairement à /jibli/[id]),
// prendre l'offre EST l'action : le prix est déjà fixé par le voyageur, la
// seule décision du client est le mode de paiement (cf.
// TakeProductOfferPayment).
export default async function ProductOfferPage({ params }: ProductOfferPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: offer, error } = await supabase.from('product_offers').select('*').eq('id', id).single()

  if (error || !offer) {
    notFound()
  }

  const isOwner = user?.id === offer.voyageur_id
  const canTake = !isOwner && offer.status === 'open'
  const canBoost = isOwner && offer.status === 'open'

  let identityStatus = null
  let bankInfo: PlatformPaymentInfo | null = null
  if (user && (canTake || canBoost)) {
    const { data: activeBankInfo } = await supabase
      .from('bank_transfer_info')
      .select('bank_name, account_holder, rib, flouci_phone')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    bankInfo = activeBankInfo
  }
  if (user && canTake) {
    identityStatus = await getIdentityStatus(supabase, user.id)
  }

  let boostTiers: BoostTier[] = []
  if (canBoost) {
    // platform_settings/boost_pricing_tiers sont admin-only en RLS — cf.
    // trips/[id]/page.tsx.
    const { data: pricing } = await supabase.rpc('get_boost_pricing_tiers')
    boostTiers = pricing ?? []
  }

  const trustScore = await getTrustScore(supabase, offer.voyageur_id)
  const total = offer.item_price + offer.delivery_fee
  const needsIdentityToTake = canTake && identityStatus !== null && identityStatus !== 'approved'

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/jibli/offres" className="text-sm text-brand-600 transition-colors hover:text-brand-700 hover:underline">
        ← Offres
      </Link>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="h-56 w-full">
          {offer.item_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- photos utilisateur, pas d'optimisation next/image nécessaire pour l'instant
            <img
              src={getPublicStorageUrl('travel-request-photos', offer.item_photo_url)}
              alt={offer.item_description}
              className="h-full w-full object-cover"
            />
          ) : (
            <RequestPhotoPlaceholder className="h-full w-full" iconClassName="h-10 w-10" />
          )}
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Tag className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden />
              <h1 className="text-xl font-bold text-slate-900">{offer.item_description}</h1>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {isBoosted(offer.boosted_until) && <BoostBadge />}
              <ProductOfferStatusBadge status={offer.status} />
            </div>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            {offer.origin_country} → {offer.destination_city} ·{' '}
            {new Date(offer.travel_date).toLocaleDateString('fr-TN')}
          </p>

          <div className="mt-4 flex items-center gap-2">
            <TrustCategoryBadge category={trustScore.category} size="md" />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
            <div>
              <p className="text-xs text-slate-500">Prix du produit</p>
              <p className="font-semibold text-slate-900">{formatTND(offer.item_price)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Frais de service</p>
              <p className="font-semibold text-slate-900">{formatTND(offer.delivery_fee)}</p>
            </div>
          </div>
          <p className="mt-2 text-sm font-medium text-brand-700">Total : {formatTND(total)}</p>

          {canBoost && (
            <div className="mt-5">
              <BoostPayment
                itemType="offer"
                itemId={offer.id}
                bankInfo={bankInfo}
                tiers={boostTiers}
                currentBoostedUntil={isBoosted(offer.boosted_until) ? offer.boosted_until : null}
              />
            </div>
          )}

          {isOwner && offer.status === 'open' && (
            <div className="mt-5">
              <CancelOfferButton offerId={offer.id} />
            </div>
          )}

          {!user && offer.status === 'open' && (
            <Link
              href={`/login?next=/jibli/offres/${offer.id}`}
              className="mt-5 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              Connecte-toi pour prendre cette offre →
            </Link>
          )}

          {needsIdentityToTake && identityStatus && (
            <div className="mt-5 rounded-lg border border-slate-200 p-3">
              <IdentityProgressBar status={identityStatus} />
              <p className="mt-3 text-sm text-slate-600">
                Ton identité doit être vérifiée avant de pouvoir prendre cette offre.
              </p>
              <Link
                href="/profil/verification-identite"
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline"
              >
                {identityStatus === 'pending' ? 'Voir ma vérification' : 'Vérifier mon identité'}
              </Link>
            </div>
          )}

          {canTake && !needsIdentityToTake && (
            <div className="mt-5">
              <TakeProductOfferPayment offerId={offer.id} bankInfo={bankInfo} />
            </div>
          )}

          {!isOwner && offer.status !== 'open' && (
            <p className="mt-5 text-sm text-slate-500">Cette offre n&apos;est plus disponible.</p>
          )}
        </div>
      </Card>
    </main>
  )
}
