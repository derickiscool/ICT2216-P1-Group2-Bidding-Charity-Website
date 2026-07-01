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
  status: CharityStatus;
  reviewedBy?: number;
  reviewedAt?: string;
  rejectionReason?: string;
  created_at: string;
}

export type ListingStatus = 'draft' | 'pending' | 'active' | 'sold' | 'expired' | 'cancelled' | 'rejected';
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

export interface SessionRecord {
  sid: string;
  userId: number;
  jtiHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
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
