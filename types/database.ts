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

export type ReleaseReason = 'client_confirmed' | 'auto_released_after_delay'

export type WithdrawalStatus = 'pending' | 'paid' | 'rejected'

export type IdentityVerificationStatus = 'pending' | 'approved' | 'rejected'

export type DisputeStatus = 'open' | 'resolved'

export type FlouciIncidentStatus = 'unresolved' | 'resolved'

export type ReviewDirection = 'client_to_voyageur' | 'voyageur_to_client'

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
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          travel_commission_rate?: number
          auto_release_delay_days?: number
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
        }
        Update: Partial<Database['public']['Tables']['travel_proposals']['Insert']>
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
export type TravelProposalOffer = Database['public']['Tables']['travel_proposal_offers']['Row']
export type TravelPayment = Database['public']['Tables']['travel_payments']['Row']
export type WithdrawalRequest = Database['public']['Tables']['withdrawal_requests']['Row']
export type Dispute = Database['public']['Tables']['disputes']['Row']
export type FlouciPaymentIncident = Database['public']['Tables']['flouci_payment_incidents']['Row']
export type TravelReview = Database['public']['Tables']['travel_reviews']['Row']
