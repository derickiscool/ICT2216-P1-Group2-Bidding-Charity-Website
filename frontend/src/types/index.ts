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

export type ListingStatus = 'draft' | 'pending' | 'active' | 'sold' | 'expired' | 'cancelled'
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

export interface AutoBid {
  id: number
  listing_id: number
  bidder_id: number
  max_amount: number
  is_active: boolean
}

// ─── Payments & Receipts ─────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refunded'

export interface Payment {
  id: number
  listing_id: number
  bidder_id: number
  amount: number
  status: PaymentStatus
  created_at: string
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
