// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = 'bidder' | 'donor' | 'charity_staff' | 'charity' | 'admin'

export interface User {
  id: number
  email: string
  username: string
  full_name: string
  roles: UserRole[]
  is_verified: boolean
  is_active: boolean
  created_at: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

// ─── Charity & Campaign ──────────────────────────────────────────────────────

export interface Charity {
  id: number
  name: string
  description: string
  registration_number: string
  website_url?: string
  logo_url?: string
  is_verified: boolean
  created_at: string
}

export interface Campaign {
  id: number
  uuid: string
  charity_id: number
  charity?: Charity
  name: string
  description: string
  status: 'active' | 'closed'
  end_date?: string
  hasImage: boolean
  total_raised: number
  active_auctions: number
  created_at: string
}

// ─── Listings & Auctions ─────────────────────────────────────────────────────

export type ListingStatus = 'draft' | 'pending' | 'active' | 'sold' | 'expired' | 'cancelled' | 'rejected'
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair'

export interface Listing {
  id: number
  uuid?: string
  donor_id: number
  campaign_id: number
  campaign?: Campaign
  charityName?: string
  title: string
  description: string
  condition: ItemCondition
  category: string
  images: string[]
  starting_price: number
  reserve_price?: number
  buy_now_price?: number
  current_bid: number
  min_increment?: number
  bid_count: number
  status: ListingStatus
  start_time: string
  end_time: string
  winner_id?: number
  created_at: string
}

export interface DonorListingStatusSummary {
  total: number
  draft: number
  pending: number
  active: number
  sold: number
  expired: number
  cancelled: number
  rejected: number
}

export interface DonorListingTrackingItem extends Listing {
  statusLabel: string
  statusMessage: string
  timelineLabel: string
  canEdit: boolean
  canDelete: boolean
  finalBidAmount?: number
}

export interface DonorListingTrackingResponse {
  generatedAt: string
  summary: DonorListingStatusSummary
  listings: DonorListingTrackingItem[]
}

// ─── Bids ────────────────────────────────────────────────────────────────────

export interface Bid {
  id: number
  listing_id: number
  bidder_id: number
  bidder_username: string
  amount: number
  is_auto_bid: boolean
  created_at: string
}

export interface AutoBid {
  id: number
  listing_id: number
  bidder_id: number
  max_amount: number
  is_active: boolean
}

// ─── Payments & Receipts ─────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'expired'
export type EscrowState = 'not_held' | 'held' | 'released' | 'refunded'

export interface Payment {
  id: number
  uuid: string
  listing_id: number
  bidder_id: number
  amount: number
  payment_ref: string
  escrow_state: EscrowState
  status: PaymentStatus
  payment_deadline: string
  offered_at: string
  paid_at?: string
  created_at: string
  updated_at: string
}

export interface PaymentWithListing extends Payment {
  listing_uuid: string
  listing_title: string
  charity_name: string
}

export interface Receipt {
  id: number
  payment_id: number
  listing_title: string
  amount_paid: number
  charity_name: string
  charity_registration: string
  receipt_number: string
  created_at: string
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType = 'outbid' | 'ending_soon' | 'won' | 'lost' | 'payment_prompt' | 'listing_approved' | 'listing_rejected' | 'funds_received'

export interface Notification {
  id: number
  user_id: number
  type: NotificationType
  message: string
  listing_id?: number
  is_read: boolean
  created_at: string
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ApiError {
  message: string
  errors?: Record<string, string>
}