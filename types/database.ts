// Types TypeScript alignés à la main sur supabase/schema.sql.
//
// Une fois le projet Supabase réel provisionné, ce fichier peut être
// régénéré automatiquement et sans divergence via :
//   npx supabase gen types typescript --project-id <ref> > types/database.ts
// (à faire à partir de la Phase 2, quand le schéma se stabilise davantage).
//
// Note : chaque table déclare `Relationships: []` (aucune jointure typée
// pour l'instant) — c'est requis par le générique GenericTable de
// @supabase/postgrest-js, sans quoi l'inférence de type des `.from(...)`
// retombe silencieusement sur `never`.
//
// Modèle métier : 2 rôles seulement, client et admin — le "voyageur" n'est
// pas un rôle distinct, cf. schema.sql. Le rôle "commerce" a existé puis a
// été retiré intégralement (aucun compte réel ne l'utilisait en prod).

export type UserRole = 'client' | 'admin'

export type PaymentMethod = 'cash' | 'flouci' | 'virement'

export type TravelRequestStatus = 'open' | 'matched' | 'in_transit' | 'completed' | 'cancelled'

export type TravelProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'

export type TravelPaymentStatus = 'awaiting_verification' | 'escrowed' | 'released' | 'refunded'

export type ReleaseReason = 'client_confirmed' | 'auto_released_after_delay' | 'admin_dispute_resolution'

export type WithdrawalStatus = 'pending' | 'paid' | 'rejected'

export type IdentityVerificationStatus = 'pending' | 'approved' | 'rejected'

export type DisputeStatus = 'open' | 'resolved'

export type DisputeResolutionType = 'released_to_voyageur' | 'refunded_to_client' | 'closed_no_action'

export type FlouciIncidentStatus = 'unresolved' | 'resolved'

export type ReviewDirection = 'client_to_voyageur' | 'voyageur_to_client'

export type NotificationType =
  | 'transaction_update'
  | 'request_update'
  | 'review_available'
  | 'verification_update'
  | 'request_matched'
  | 'boost_update'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export type NotificationRelatedObjectType =
  | 'travel_request'
  | 'travel_payment'
  | 'identity_verification'
  | 'trip'
  | 'product_offer'

export type TripStatus = 'open' | 'matched' | 'completed' | 'cancelled'

export type ProductOfferStatus = 'open' | 'matched' | 'completed' | 'cancelled'

// Boost payant (Phase 3, brique 5/N) — pas de lifecycle escrow/libération
// contrairement à TravelPaymentStatus : un boost est consommé
// immédiatement, jamais retenu puis "livré" à une contrepartie.
export type BoostPaymentStatus = 'awaiting_verification' | 'paid'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: UserRole
          email: string | null
          full_name: string | null
          phone: string | null
          address: string | null
          country: string | null
          profession: string | null
          address_lat: number | null
          address_lng: number | null
          avatar_url: string | null
          cover_url: string | null
          bio: string | null
          is_active: boolean
          referral_code: string | null
          referred_by: string | null
          referral_reward_granted: boolean
          wallet_balance: number
          onesignal_player_id: string | null
          onboarding_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: UserRole
          email?: string | null
          full_name?: string | null
          phone?: string | null
          address?: string | null
          country?: string | null
          profession?: string | null
          address_lat?: number | null
          address_lng?: number | null
          avatar_url?: string | null
          cover_url?: string | null
          bio?: string | null
          is_active?: boolean
          referral_code?: string | null
          referred_by?: string | null
          referral_reward_granted?: boolean
          wallet_balance?: number
          onesignal_player_id?: string | null
          onboarding_seen_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      // wallet_credits.order_id référençait orders (supprimée avec le rôle
      // commerce) — la FK a disparu par CASCADE, colonne conservée en
      // string | null nu. reason: 'checkout_redemption' orpheline (plus
      // aucun code n'insère avec cette valeur), laissée telle quelle.
      wallet_credits: {
        Row: {
          id: string
          profile_id: string
          amount: number
          reason: 'referral_referrer' | 'referral_referred' | 'checkout_redemption'
          order_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          amount: number
          reason: 'referral_referrer' | 'referral_referred' | 'checkout_redemption'
          order_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['wallet_credits']['Insert']>
        Relationships: []
      }
      bank_transfer_info: {
        Row: {
          id: string
          bank_name: string
          account_holder: string
          rib: string
          iban: string | null
          flouci_phone: string | null
          is_active: boolean
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          bank_name: string
          account_holder: string
          rib: string
          iban?: string | null
          flouci_phone?: string | null
          is_active?: boolean
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['bank_transfer_info']['Insert']>
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: boolean
          travel_commission_rate: number
          auto_release_delay_days: number
          boost_price_tnd: number
          boost_duration_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          travel_commission_rate?: number
          auto_release_delay_days?: number
          boost_price_tnd?: number
          boost_duration_days?: number
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['platform_settings']['Insert']>
        Relationships: []
      }
      travel_requests: {
        Row: {
          id: string
          client_id: string
          item_description: string
          item_url: string | null
          item_photo_url: string | null
          origin_country: string
          destination_city: string
          budget_max: number
          needed_by: string | null
          status: TravelRequestStatus
          accepted_proposal_id: string | null
          client_confirmed_at: string | null
          completed_at: string | null
          // Optionnel — n'affecte que le score des RPC de matching Trips,
          // aucun flux existant n'en dépend. cf. schema.sql.
          item_weight_kg: number | null
          // Boost payant (Phase 3, brique 6/N) — uniquement pertinent pour
          // status='open' (une demande matched n'est plus listée nulle
          // part). Même discipline que trips/product_offers.boosted_until :
          // jamais écrit directement, seule purchase_boost_virement() la
          // modifie. cf. schema.sql.
          boosted_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          item_description: string
          item_url?: string | null
          item_photo_url?: string | null
          origin_country: string
          destination_city: string
          budget_max: number
          needed_by?: string | null
          status?: TravelRequestStatus
          accepted_proposal_id?: string | null
          client_confirmed_at?: string | null
          completed_at?: string | null
          item_weight_kg?: number | null
          boosted_until?: string | null
        }
        Update: Partial<Database['public']['Tables']['travel_requests']['Insert']>
        Relationships: []
      }
      travel_proposals: {
        Row: {
          id: string
          request_id: string
          voyageur_id: string
          item_price: number
          delivery_fee: number
          travel_date: string | null
          message: string | null
          pickup_city: string | null
          expires_at: string | null
          status: TravelProposalStatus
          last_offer_by: 'client' | 'voyageur'
          terms_confirmed_by: string | null
          terms_confirmed_at: string | null
          // Non nul quand cette proposition vient d'un match Trips
          // ("Proposer" depuis la liste de matches d'un trip). Nul pour une
          // proposition créée normalement (voyageur parcourant une demande
          // directement) — comportement inchangé.
          source_trip_id: string | null
          // Non nul quand cette proposition vient de take_product_offer()
          // ("Offres" — Phase 3, brique 4/N). Mutuellement exclusif avec
          // source_trip_id en pratique (une proposition vient d'au plus un
          // chemin), mais pas contraint en base — les deux restent
          // simplement nuls pour une proposition créée normalement.
          source_offer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_id: string
          voyageur_id: string
          item_price: number
          delivery_fee: number
          travel_date?: string | null
          message?: string | null
          pickup_city?: string | null
          expires_at?: string | null
          status?: TravelProposalStatus
          last_offer_by?: 'client' | 'voyageur'
          terms_confirmed_by?: string | null
          terms_confirmed_at?: string | null
          source_trip_id?: string | null
          source_offer_id?: string | null
        }
        Update: Partial<Database['public']['Tables']['travel_proposals']['Insert']>
        Relationships: []
      }
      trips: {
        Row: {
          id: string
          voyageur_id: string
          origin_country: string
          destination_city: string
          travel_date: string
          available_weight_kg: number
          indicative_price: number | null
          pickup_city: string | null
          message: string | null
          status: TripStatus
          matched_proposal_id: string | null
          expires_at: string | null
          // Boost payant (Phase 3, brique 5/N) — jamais écrit directement
          // par un client (RLS le permettrait techniquement mais aucun flux
          // ne le fait), seule purchase_boost_virement() (SECURITY DEFINER)
          // la modifie. cf. schema.sql.
          boosted_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          voyageur_id: string
          origin_country: string
          destination_city: string
          travel_date: string
          available_weight_kg: number
          indicative_price?: number | null
          pickup_city?: string | null
          message?: string | null
          status?: TripStatus
          matched_proposal_id?: string | null
          expires_at?: string | null
          boosted_until?: string | null
        }
        Update: Partial<Database['public']['Tables']['trips']['Insert']>
        Relationships: []
      }
      product_offers: {
        Row: {
          id: string
          voyageur_id: string
          item_description: string
          item_photo_url: string | null
          origin_country: string
          destination_city: string
          travel_date: string
          item_price: number
          delivery_fee: number
          status: ProductOfferStatus
          matched_proposal_id: string | null
          // cf. trips.boosted_until ci-dessus, même discipline.
          boosted_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          voyageur_id: string
          item_description: string
          item_photo_url?: string | null
          origin_country: string
          destination_city: string
          travel_date: string
          item_price: number
          delivery_fee: number
          status?: ProductOfferStatus
          matched_proposal_id?: string | null
          boosted_until?: string | null
        }
        Update: Partial<Database['public']['Tables']['product_offers']['Insert']>
        Relationships: []
      }
      boost_payments: {
        Row: {
          id: string
          voyageur_id: string
          trip_id: string | null
          product_offer_id: string | null
          // 3e origine possible (Phase 3, brique 6/N) — cf. schema.sql,
          // contrainte boost_payments_exactly_one_item étendue aux 3.
          request_id: string | null
          payment_method: PaymentMethod
          payment_proof_url: string | null
          payment_ref: string | null
          amount: number
          duration_days: number
          status: BoostPaymentStatus
          verified_by: string | null
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          voyageur_id: string
          trip_id?: string | null
          product_offer_id?: string | null
          request_id?: string | null
          payment_method: PaymentMethod
          payment_proof_url?: string | null
          payment_ref?: string | null
          amount: number
          duration_days: number
          status?: BoostPaymentStatus
          verified_by?: string | null
          verified_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['boost_payments']['Insert']>
        Relationships: []
      }
      // Tarification par palier (Phase 3, brique 6/N) — cf. schema.sql.
      boost_pricing_tiers: {
        Row: {
          duration_days: number
          price_tnd: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          duration_days: number
          price_tnd: number
          updated_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['boost_pricing_tiers']['Insert']>
        Relationships: []
      }
      travel_proposal_offers: {
        Row: {
          id: string
          proposal_id: string
          author_id: string
          author_role: 'client' | 'voyageur'
          item_price: number
          delivery_fee: number
          message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          proposal_id: string
          author_id: string
          author_role: 'client' | 'voyageur'
          item_price: number
          delivery_fee: number
          message?: string | null
        }
        Update: Partial<Database['public']['Tables']['travel_proposal_offers']['Insert']>
        Relationships: []
      }
      travel_payments: {
        Row: {
          id: string
          request_id: string
          payment_method: PaymentMethod
          payment_proof_url: string | null
          payment_ref: string | null
          amount: number
          commission_amount: number
          status: TravelPaymentStatus
          verified_by: string | null
          verified_at: string | null
          released_at: string | null
          release_reason: ReleaseReason | null
          refunded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          request_id: string
          payment_method: PaymentMethod
          payment_proof_url?: string | null
          payment_ref?: string | null
          amount: number
          commission_amount?: number
          status?: TravelPaymentStatus
          verified_by?: string | null
          verified_at?: string | null
          released_at?: string | null
          release_reason?: ReleaseReason | null
          refunded_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['travel_payments']['Insert']>
        Relationships: []
      }
      disputes: {
        Row: {
          id: string
          travel_request_id: string
          opened_by: string
          reason: string
          status: DisputeStatus
          resolution_note: string | null
          resolved_by: string | null
          resolved_at: string | null
          resolution_type: DisputeResolutionType | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          travel_request_id: string
          opened_by: string
          reason: string
          status?: DisputeStatus
          resolution_note?: string | null
          resolved_by?: string | null
          resolution_type?: DisputeResolutionType | null
          resolved_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['disputes']['Insert']>
        Relationships: []
      }
      flouci_payment_incidents: {
        Row: {
          id: string
          travel_request_id: string
          travel_proposal_id: string
          client_id: string
          flouci_payment_id: string
          amount: number
          error_message: string
          status: FlouciIncidentStatus
          resolution_note: string | null
          resolved_by: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          travel_request_id: string
          travel_proposal_id: string
          client_id: string
          flouci_payment_id: string
          amount: number
          error_message: string
          status?: FlouciIncidentStatus
          resolution_note?: string | null
          resolved_by?: string | null
          resolved_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['flouci_payment_incidents']['Insert']>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: NotificationType
          priority: NotificationPriority
          title: string
          body: string | null
          related_object_type: NotificationRelatedObjectType | null
          related_object_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: NotificationType
          priority?: NotificationPriority
          title: string
          body?: string | null
          related_object_type?: NotificationRelatedObjectType | null
          related_object_id?: string | null
          read_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: []
      }
      travel_reviews: {
        Row: {
          id: string
          travel_request_id: string
          reviewer_id: string
          reviewee_id: string
          direction: ReviewDirection
          rating: number
          comment: string | null
          hidden_by_admin: boolean
          hidden_reason: string | null
          hidden_by: string | null
          hidden_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          travel_request_id: string
          reviewer_id: string
          reviewee_id: string
          direction: ReviewDirection
          rating: number
          comment?: string | null
          hidden_by_admin?: boolean
          hidden_reason?: string | null
          hidden_by?: string | null
          hidden_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['travel_reviews']['Insert']>
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          id: string
          voyageur_id: string
          amount: number
          status: WithdrawalStatus
          requested_at: string
          processed_at: string | null
          processed_by: string | null
        }
        Insert: {
          id?: string
          voyageur_id: string
          amount: number
          status?: WithdrawalStatus
          requested_at?: string
          processed_at?: string | null
          processed_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['withdrawal_requests']['Insert']>
        Relationships: []
      }
      wallet_adjustments: {
        Row: {
          id: string
          profile_id: string
          amount: number
          reason: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          amount: number
          reason: string
          created_by: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['wallet_adjustments']['Insert']>
        Relationships: []
      }
      identity_verifications: {
        Row: {
          id: string
          profile_id: string
          id_document_url: string
          selfie_url: string
          status: IdentityVerificationStatus
          rejection_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          id_document_url: string
          selfie_url: string
          status?: IdentityVerificationStatus
          rejection_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['identity_verifications']['Insert']>
        Relationships: []
      }
    }
    // admin_client_stats supprimée avec `orders` (dont elle dépendait
    // entièrement) — cf. supabase/schema.sql.
    Views: {}
    Functions: {
      list_my_sessions: {
        Args: Record<string, never>
        Returns: { id: string; created_at: string; updated_at: string; user_agent: string | null; ip: string | null }[]
      }
      revoke_my_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      adjust_wallet_balance: {
        Args: { p_profile_id: string; p_amount: number; p_reason: string }
        Returns: undefined
      }
      submit_identity_verification: {
        Args: { p_id_document_url: string; p_selfie_url: string }
        Returns: undefined
      }
      accept_travel_proposal: {
        Args: {
          p_proposal_id: string
          p_payment_method: PaymentMethod
          p_payment_proof_url?: string | null
          p_payment_ref?: string | null
        }
        Returns: undefined
      }
      confirm_travel_receipt: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      // "Offres" (Phase 3, brique 4/N). Crée travel_requests +
      // travel_proposals à partir d'une offre à prix fixe et flip l'offre
      // à 'matched' — le client appelle ensuite accept_travel_proposal()
      // (existante, inchangée) avec proposal_id pour finaliser le paiement.
      take_product_offer: {
        Args: { p_offer_id: string }
        Returns: { request_id: string; proposal_id: string }[]
      }
      // Nom + avatar publics uniquement (jamais phone/address/country/
      // profession/email) — pour les cartes de listing (TripCard/
      // ProductOfferCard/RequestCard). Batchée, cf. lib/profiles.ts.
      get_public_profile_summaries: {
        Args: { p_profile_ids: string[] }
        Returns: { id: string; full_name: string | null; avatar_url: string | null }[]
      }
      // Compteur "Membres Livrily" (page d'accueil publique) — profiles
      // n'est pas lisible par un visiteur anonyme (profiles_select_own_or_admin),
      // cf. app/(client)/page.tsx.
      get_platform_member_count: {
        Args: Record<string, never>
        Returns: number
      }
      travel_voyageur_balance: {
        Args: { p_voyageur_id: string }
        Returns: number
      }
      submit_counter_offer: {
        Args: { p_proposal_id: string; p_item_price: number; p_delivery_fee: number; p_message?: string | null }
        Returns: undefined
      }
      agree_to_current_offer: {
        Args: { p_proposal_id: string }
        Returns: undefined
      }
      is_identity_verified: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      get_travel_request_engagement: {
        Args: { p_request_ids: string[] }
        Returns: { request_id: string; total_proposals: number; recent_proposals: number }[]
      }
      get_profile_rating: {
        Args: { p_profile_id: string }
        Returns: { avg_rating: number | null; review_count: number }[]
      }
      // Trust System (Phase 3, brique 3/N). compute_trust_signals() est
      // interne (verrouillée en base, aucun grant à authenticated/anon) —
      // pas d'entrée ici, jamais appelable depuis le client.
      get_trust_score: {
        Args: { p_profile_id: string }
        Returns: { score: number; category: string }[]
      }
      get_trust_badges: {
        Args: { p_profile_id: string }
        Returns: { badge: string }[]
      }
      // Recommandation seulement — n'écrit jamais de travel_proposals.
      // score inclut le bonus Trust Score (catégorie, jamais le brut) ;
      // logistics_score (date + poids seuls) pilote le badge "Très bonne
      // correspondance" côté cartes — cf. schema.sql pour la séparation.
      get_trip_matches_for_request: {
        Args: { p_request_id: string }
        Returns: {
          trip_id: string
          voyageur_id: string
          origin_country: string
          destination_city: string
          travel_date: string
          available_weight_kg: number
          indicative_price: number | null
          score: number
          logistics_score: number
          trust_category: string
        }[]
      }
      get_request_matches_for_trip: {
        Args: { p_trip_id: string }
        Returns: {
          request_id: string
          client_id: string
          item_description: string
          origin_country: string
          destination_city: string
          needed_by: string | null
          budget_max: number
          item_weight_kg: number | null
          score: number
          logistics_score: number
          trust_category: string
        }[]
      }
      resolve_dispute_release_funds: {
        Args: { p_dispute_id: string; p_note: string }
        Returns: undefined
      }
      resolve_dispute_refund: {
        Args: { p_dispute_id: string; p_note: string }
        Returns: undefined
      }
      resolve_dispute_close: {
        Args: { p_dispute_id: string; p_note: string }
        Returns: undefined
      }
      // Boost payant (Phase 3, brique 5/N puis 6/N) — RPC polymorphe
      // (p_item_type), cf. schema.sql pour le raisonnement. new_boosted_until
      // (pas boosted_until) : nom distinct des colonnes trips/product_offers/
      // travel_requests référencées dans le corps de la fonction, cf.
      // commentaire schema.sql sur le bug d'ambiguïté trouvé en testant.
      //
      // Cette entrée décrit la surcharge 4-arg (p_duration_days, tarification
      // par palier) — la seule que ce projet appelle depuis le TypeScript.
      // La surcharge 3-arg existe toujours côté base (additif, jamais
      // supprimé) mais n'a plus de type ici : aucun code ne l'appelle plus,
      // pas besoin de la décrire pour ce client. 'request' (en plus de
      // 'trip'/'offer') : uniquement pour status='open' (cf. schema.sql).
      purchase_boost_virement: {
        Args: { p_item_type: 'trip' | 'offer' | 'request'; p_item_id: string; p_payment_proof_url: string; p_duration_days: number }
        Returns: { payment_id: string; new_boosted_until: string }[]
      }
      // platform_settings est admin-only en RLS — seul moyen pour un
      // propriétaire de trip/offre de connaître le prix/durée du boost.
      get_boost_pricing: {
        Args: Record<string, never>
        Returns: { boost_price_tnd: number; boost_duration_days: number }[]
      }
      // Tarification par palier (Phase 3, brique 6/N) — remplace
      // get_boost_pricing() côté app (celle-ci reste appelable côté base,
      // additif, mais plus aucun code TypeScript ne l'utilise). Même
      // raisonnement RLS (platform_settings/boost_pricing_tiers admin-only).
      get_boost_pricing_tiers: {
        Args: Record<string, never>
        Returns: { duration_days: number; price_tnd: number }[]
      }
      // Non exposée à `authenticated` côté DB (revoke explicite) — appelable
      // uniquement via le client service_role (createAdminClient()). Gardée
      // ici pour le typage de ce client-là, comme les autres fonctions.
      create_notification: {
        Args: {
          p_user_id: string
          p_type: NotificationType
          p_title: string
          p_body?: string | null
          p_priority?: NotificationPriority
          p_related_object_type?: NotificationRelatedObjectType | null
          p_related_object_id?: string | null
        }
        Returns: string
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type BankTransferInfo = Database['public']['Tables']['bank_transfer_info']['Row']
export type PlatformSettings = Database['public']['Tables']['platform_settings']['Row']
export type WalletAdjustment = Database['public']['Tables']['wallet_adjustments']['Row']
export type IdentityVerification = Database['public']['Tables']['identity_verifications']['Row']
export type TravelRequest = Database['public']['Tables']['travel_requests']['Row']
export type TravelProposal = Database['public']['Tables']['travel_proposals']['Row']
export type Trip = Database['public']['Tables']['trips']['Row']
export type ProductOffer = Database['public']['Tables']['product_offers']['Row']
export type TravelProposalOffer = Database['public']['Tables']['travel_proposal_offers']['Row']
export type TravelPayment = Database['public']['Tables']['travel_payments']['Row']
export type WithdrawalRequest = Database['public']['Tables']['withdrawal_requests']['Row']
export type Dispute = Database['public']['Tables']['disputes']['Row']
export type FlouciPaymentIncident = Database['public']['Tables']['flouci_payment_incidents']['Row']
export type TravelReview = Database['public']['Tables']['travel_reviews']['Row']
export type BoostPayment = Database['public']['Tables']['boost_payments']['Row']
export type BoostPricingTier = Database['public']['Tables']['boost_pricing_tiers']['Row']
