export type UserRole = 'bidder' | 'donor' | 'charity_staff' | 'charity' | 'admin';

export interface User {
  id: number;
  uuid: string;
  email: string;
  username: string;
  full_name: string;
  roles: UserRole[];
  passwordHash: string;
  is_verified: boolean;
  is_active: boolean;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  contactNumber?: string;
  charityId?: number;
  lastLoginAt?: string;
  created_at: string;
}

export interface PendingRegistration {
  id: string;
  email: string;
  username: string;
  full_name: string;
  passwordHash: string;
  roles: UserRole[];
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export interface LoginOtp {
  user_id: number;
  email: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export interface EmailChangeRequest {
  user_id: number;
  newEmail: string;
  oldEmail: string;
  oldEmailOtpHash: string;
  newEmailOtpHash: string | null;
  oldEmailConfirmed: boolean;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export interface Campaign {
  id: number;
  uuid: string;
  charity_id: number;
  name: string;
  description: string;
  status: 'active' | 'closed';
  end_date?: string;
  hasImage: boolean;
  total_raised: number;
  active_auctions: number;
  created_at: string;
}

export type NewCampaignInput = {
  charityId: number;
  name: string;
  description: string;
  endDate?: string;
  imageData?: Buffer;
  imageMime?: string;
};

export type UpdateCampaignInput = {
  name: string;
  description: string;
  endDate?: string;
  imageData?: Buffer | null;
  imageMime?: string | null;
};

export type CharityStatus = 'pending' | 'approved' | 'rejected';
export interface CharityOrganisation {
  id: number;
  uuid: string;
  ownerUserId: number;
  organisationName: string;
  description: string;
  documentName: string;
  documentMime: 'application/pdf' | 'image/png' | 'image/jpeg';
  documentSha256: string;
  documentData?: Buffer | null;
  status: CharityStatus;
  reviewedBy?: number;
  reviewedAt?: string;
  rejectionReason?: string;
  created_at: string;
}

export type ListingStatus = 'draft' | 'pending' | 'active' | 'sold' | 'shipped' | 'delivered' | 'expired' | 'cancelled' | 'rejected';
export interface Listing {
  id: number;
  uuid: string;
  donor_id: number;
  campaign_id: number;
  title: string;
  description: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  category: string;
  images: string[];
  starting_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  current_bid: number;
  bid_count: number;
  status: ListingStatus;
  start_time: string;
  end_time: string;
  winner_id?: number;
  charityName: string;
  min_increment: number;
  created_at: string;
}

export interface DonorListingStatusSummary {
  total: number;
  draft: number;
  pending: number;
  active: number;
  sold: number;
  shipped: number;
  delivered: number;
  expired: number;
  cancelled: number;
  rejected: number;
}

export interface DonorListingTrackingItem extends Listing {
  // Backend-owned user interface hints for FR10. The frontend can display these
  // directly without reimplementing auction status rules in the browser.
  statusLabel: string;
  statusMessage: string;
  timelineLabel: string;
  canEdit: boolean;
  canDelete: boolean;
  finalBidAmount?: number;
}

export interface DonorListingTrackingDashboard {
  generatedAt: string;
  summary: DonorListingStatusSummary;
  listings: DonorListingTrackingItem[];
}

export interface Bid {
  id: number;
  uuid: string;
  listing_id: number;
  bidder_id: number;
  bidder_username: string;
  amount: number;
  is_auto_bid: boolean;
  created_at: string;
}


export interface AutoBidSetting {
  id: number;
  uuid: string;
  listing_id: number;
  bidder_id: number;
  bidder_username: string;
  max_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutoBidWithListing extends AutoBidSetting {
  listingTitle?: string;
  listingUuid?: string;
  listingStatus?: ListingStatus;
  currentBid?: number;
  endTime?: string;
}

export interface BidWithListing extends Bid {
  listingTitle?: string;
  listingUuid?: string;
}

export interface Delivery {
  id: number;
  uuid: string;
  listing_id: number;
  tracking_number?: string;
  courier?: string;
  shipped_at?: string;
  confirmed_at?: string;
  created_at: string;
}

export interface Receipt {
  id: number;
  uuid: string;
  payment_id: number;
  listing_id: number;
  bidder_id: number;
  item_title: string;
  amount: number;
  charity_name: string;
  receipt_ref: string;
  integrity_hash: string;
  generated_at: string;
}

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'expired';
export type EscrowState = 'not_held' | 'held' | 'released' | 'refunded';

export interface Payment {
  id: number;
  uuid: string;
  listing_id: number;
  bidder_id: number;
  amount: number;
  payment_ref: string;
  escrow_state: EscrowState;
  status: PaymentStatus;
  payment_deadline: string;
  offered_at: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

// Response shape used by bidder-facing payment pages. Keeping this as a separate
// type prevents the backend from accidentally exposing unnecessary listing/user data.
export interface PaymentWithListing extends Payment {
  listing_uuid: string;
  listing_title: string;
  charity_name: string;
  has_shipping: boolean;
}

export interface PasswordResetToken {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

export interface SessionRecord {
  sid: string;
  userId: number;
  jtiHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface AuditEvent {
  id: number;
  timestamp: string;
  actorUserId?: number;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipHash?: string;
  userAgentHash?: string;
  payload: Record<string, unknown>;
  previousHash: string;
  currentHash: string;
}