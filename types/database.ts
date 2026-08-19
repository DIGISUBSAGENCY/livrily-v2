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
// Modèle métier : pas de rôle "livreur" indépendant. Un commerce (role
// 'commerce') gère sa propre livraison ; `commerce_delivery_staff` est un
// registre interne sans compte utilisateur associé.

export type UserRole = 'client' | 'commerce' | 'admin'

export type CommerceCategory = 'supermarche' | 'boulangerie' | 'fruits_legumes' | 'pharmacie'

export type OrderStatus = 'pending' | 'accepted' | 'ready' | 'delivering' | 'delivered' | 'cancelled'

export type PaymentMethod = 'cash' | 'flouci' | 'virement'

export type PaymentStatus = 'pending' | 'paid' | 'awaiting_verification' | 'rejected' | 'failed'

export type TravelRequestStatus = 'open' | 'matched' | 'in_transit' | 'completed' | 'cancelled'

export type TravelProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'

export type TravelPaymentStatus = 'awaiting_verification' | 'escrowed' | 'released' | 'refunded'

export type WithdrawalStatus = 'pending' | 'paid' | 'rejected'

export type IdentityVerificationStatus = 'pending' | 'approved' | 'rejected'

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
      delivery_zones: {
        Row: {
          id: string
          name: string
          city: string | null
          center_lat: number
          center_lng: number
          radius_meters: number
          delivery_fee: number
          fee_per_km: number
          min_order_amount: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          city?: string | null
          center_lat: number
          center_lng: number
          radius_meters: number
          delivery_fee?: number
          fee_per_km?: number
          min_order_amount?: number
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['delivery_zones']['Insert']>
        Relationships: []
      }
      zone_surge_rules: {
        Row: {
          id: string
          zone_id: string
          label: string
          days_of_week: number[]
          start_time: string
          end_time: string
          multiplier: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          zone_id: string
          label: string
          days_of_week?: number[]
          start_time: string
          end_time: string
          multiplier: number
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['zone_surge_rules']['Insert']>
        Relationships: []
      }
      commerces: {
        Row: {
          id: string
          owner_id: string | null
          name: string
          category: CommerceCategory
          description: string | null
          logo_url: string | null
          address: string | null
          lat: number | null
          lng: number | null
          zone_id: string | null
          phone: string | null
          is_active: boolean
          is_open: boolean
          stats_delivered_count: number
          stats_delivery_minutes_sum: number
          stats_on_time_count: number
          stats_decided_count: number
          stats_accepted_count: number
          avg_delivery_time_minutes: number | null
          on_time_rate: number | null
          acceptance_rate: number | null
          ratings_sum: number
          ratings_count: number
          ratings_avg: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          name: string
          category: CommerceCategory
          description?: string | null
          logo_url?: string | null
          address?: string | null
          lat?: number | null
          lng?: number | null
          zone_id?: string | null
          phone?: string | null
          is_active?: boolean
          is_open?: boolean
        }
        Update: Partial<Database['public']['Tables']['commerces']['Insert']>
        Relationships: []
      }
      products: {
        Row: {
          id: string
          commerce_id: string
          name: string
          description: string | null
          price: number
          image_url: string | null
          unit: string
          is_available: boolean
          requires_prescription: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          commerce_id: string
          name: string
          description?: string | null
          price: number
          image_url?: string | null
          unit?: string
          is_available?: boolean
          requires_prescription?: boolean
        }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
        Relationships: []
      }
      commerce_delivery_staff: {
        Row: {
          id: string
          commerce_id: string
          full_name: string
          phone: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          commerce_id: string
          full_name: string
          phone?: string | null
          is_active?: boolean
        }
        Update: Partial<Database['public']['Tables']['commerce_delivery_staff']['Insert']>
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          client_id: string
          commerce_id: string
          delivery_staff_id: string | null
          zone_id: string | null
          status: OrderStatus
          delivery_address: string
          delivery_lat: number | null
          delivery_lng: number | null
          subtotal: number
          delivery_fee: number
          total: number
          payment_method: PaymentMethod
          payment_status: PaymentStatus
          payment_ref: string | null
          payment_proof_url: string | null
          payment_verified_by: string | null
          payment_verified_at: string | null
          client_note: string | null
          cancelled_reason: string | null
          delivery_proof_url: string | null
          prescription_url: string | null
          wallet_credit_applied: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          commerce_id: string
          delivery_staff_id?: string | null
          zone_id?: string | null
          status?: OrderStatus
          delivery_address: string
          delivery_lat?: number | null
          delivery_lng?: number | null
          subtotal: number
          delivery_fee?: number
          total: number
          payment_method: PaymentMethod
          payment_status?: PaymentStatus
          payment_ref?: string | null
          payment_proof_url?: string | null
          payment_verified_by?: string | null
          payment_verified_at?: string | null
          client_note?: string | null
          cancelled_reason?: string | null
          delivery_proof_url?: string | null
          prescription_url?: string | null
          wallet_credit_applied?: number
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          unit_price: number
          quantity: number
          subtotal: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          unit_price: number
          quantity: number
          subtotal: number
        }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
        Relationships: []
      }
      delivery_tracking: {
        Row: {
          id: number
          order_id: string
          commerce_id: string
          lat: number
          lng: number
          recorded_at: string
        }
        Insert: {
          id?: number
          order_id: string
          commerce_id: string
          lat: number
          lng: number
          recorded_at?: string
        }
        Update: Partial<Database['public']['Tables']['delivery_tracking']['Insert']>
        Relationships: []
      }
      ratings: {
        Row: {
          id: string
          order_id: string
          client_id: string
          commerce_id: string | null
          score: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          client_id: string
          commerce_id?: string | null
          score: number
          comment?: string | null
        }
        Update: Partial<Database['public']['Tables']['ratings']['Insert']>
        Relationships: []
      }
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
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          travel_commission_rate?: number
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
        }
        Update: Partial<Database['public']['Tables']['travel_payments']['Insert']>
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
    Views: {
      admin_client_stats: {
        Row: {
          profile_id: string
          orders_count: number
          last_order_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      debit_wallet: {
        Args: { p_profile_id: string; p_amount: number }
        Returns: undefined
      }
      submit_counter_offer: {
        Args: { p_proposal_id: string; p_item_price: number; p_delivery_fee: number; p_message?: string | null }
        Returns: undefined
      }
      agree_to_current_offer: {
        Args: { p_proposal_id: string }
        Returns: undefined
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type DeliveryZone = Database['public']['Tables']['delivery_zones']['Row']
export type ZoneSurgeRule = Database['public']['Tables']['zone_surge_rules']['Row']
export type Commerce = Database['public']['Tables']['commerces']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type CommerceDeliveryStaff = Database['public']['Tables']['commerce_delivery_staff']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type DeliveryTracking = Database['public']['Tables']['delivery_tracking']['Row']
export type Rating = Database['public']['Tables']['ratings']['Row']
export type BankTransferInfo = Database['public']['Tables']['bank_transfer_info']['Row']
export type PlatformSettings = Database['public']['Tables']['platform_settings']['Row']
export type AdminClientStats = Database['public']['Views']['admin_client_stats']['Row']
export type WalletAdjustment = Database['public']['Tables']['wallet_adjustments']['Row']
export type IdentityVerification = Database['public']['Tables']['identity_verifications']['Row']
export type TravelRequest = Database['public']['Tables']['travel_requests']['Row']
export type TravelProposal = Database['public']['Tables']['travel_proposals']['Row']
export type TravelProposalOffer = Database['public']['Tables']['travel_proposal_offers']['Row']
export type TravelPayment = Database['public']['Tables']['travel_payments']['Row']
export type WithdrawalRequest = Database['public']['Tables']['withdrawal_requests']['Row']
