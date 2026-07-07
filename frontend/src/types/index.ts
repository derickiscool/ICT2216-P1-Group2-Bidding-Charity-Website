// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = 'bidder' | 'donor' | 'charity_staff' | 'charity' | 'admin'

export interface User {
  id: number
  uuid?: string
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
  can_ship?: boolean
  payment_held?: boolean
  has_shipped?: boolean
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
  listingTitle?: string
  listingUuid?: string
}

export interface BidPlacementResponse {
  bids: Bid[]
  currentBid: number
  winnerId?: number
}

export interface AutoBid {
  id: number
  uuid: string
  listing_id: number
  bidder_id: number
  bidder_username: string
  max_amount: number
  is_active: boolean
  created_at: string
  updated_at: string
  listingTitle?: string
  listingUuid?: string
  listingStatus?: ListingStatus
  currentBid?: number
  endTime?: string
}

export interface AutoBidResponse {
  autoBid: AutoBid
  result: BidPlacementResponse
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
  has_shipping: boolean
  listing_status?: string
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

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface DonorStats {
  total: number
  active: number
  sold: number
  pending: number
  draft: number
  totalRaised: number
}

export interface BidderStats {
  total: number
  totalSpent: number
  uniqueListings: number
}

export interface CharityStats {
  totalItems: number
  activeItems: number
  totalRaised: number
  paymentsReceived: number
  paymentsPending: number
  paymentsReleasedCount: number
  paymentsHeldCount: number
}

export interface AdminStats {
  totalUsers: number
  totalListings: number
  totalBids: number
  pendingCharities: number
  pendingListings: number
}

export type CharityStatus = 'pending' | 'approved' | 'rejected'

export interface CharityOrganisation {
  id: number
  uuid: string
  ownerUserId: number
  organisationName: string
  description: string
  documentName: string
  documentMime: string
  documentSha256: string
  status: CharityStatus
  reviewedBy?: number
  reviewedAt?: string
  rejectionReason?: string
  created_at: string
}

export interface Receipt {
  id: number
  uuid: string
  payment_id: number
  listing_id: number
  bidder_id: number
  item_title: string
  amount: number
  charity_name: string
  receipt_ref: string
  integrity_hash: string
  generated_at: string
}

export interface AuditEvent {
  id: number
  timestamp: string
  actorUserId?: number
  action: string
  resourceType?: string
  resourceId?: string
  ipHash?: string
  userAgentHash?: string
  payload: Record<string, unknown>
  previousHash: string
  currentHash: string
}