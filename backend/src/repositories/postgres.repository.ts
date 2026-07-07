import argon2 from 'argon2';
import type {
  AuditEvent,
  AutoBidSetting,
  AutoBidWithListing,
  Bid,
  BidWithListing,
  Campaign,
  CharityOrganisation,
  Delivery,
  Listing,
  ListingStatus,
  Payment,
  PaymentWithListing,
  Receipt,
  NewCampaignInput,
  PasswordResetToken,
  PendingRegistration,
  LoginOtp,
  EmailChangeRequest,
  SessionRecord,
  UpdateCampaignInput,
  User,
  UserRole,
} from '../types/domain';
import { query, withTransaction } from '../utils/db';
import { sha256 } from '../utils/security';
import type {
  BidForGoodRepository,
  NewAuditEventInput,
  NewAutoBidInput,
  NewBidInput,
  NewCharityInput,
  NewListingInput,
  NewPaymentInput,
  NewUserInput,
  PublicUser,
} from './repository.types';

type DbDate = Date | string;

interface UserRow {
  id: number;
  uuid: string;
  email: string;
  username: string;
  full_name: string;
  roles: UserRole[];
  password_hash: string;
  is_verified: boolean;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: DbDate | null;
  contact_number: string | null;
  charity_id: number | null;
  last_login_at: DbDate | null;
  created_at: DbDate;
}

interface PendingRegistrationRow {
  id: string;
  email: string;
  username: string;
  full_name: string;
  password_hash: string;
  roles: UserRole[];
  otp_hash: string;
  expires_at: DbDate;
  attempts: number;
  created_at: DbDate;
}

interface LoginOtpRow {
  user_id: number | string;
  email: string;
  otp_hash: string;
  expires_at: DbDate;
  attempts: number;
  created_at: DbDate;
}
 
interface PasswordResetTokenRow {
  email: string;
  token_hash: string;
  expires_at: DbDate;
  attempts: number;
  created_at: DbDate;
}

interface EmailChangeRequestRow {
  user_id: number | string;
  new_email: string;
  old_email: string;
  old_email_otp_hash: string;
  new_email_otp_hash: string | null;
  old_email_confirmed: boolean;
  expires_at: DbDate;
  attempts: number;
  created_at: DbDate;
}

interface SessionRow {
  sid: string;
  user_id: number;
  jti_hash: string;
  csrf_token_hash: string;
  expires_at: DbDate;
  absolute_expires_at: DbDate;
  revoked_at: DbDate | null;
  created_at: DbDate;
  last_seen_at: DbDate;
}

interface CharityRow {
  id: number;
  uuid: string;
  owner_user_id: number;
  organisation_name: string;
  description: string;
  document_name: string;
  document_mime: 'application/pdf' | 'image/png' | 'image/jpeg';
  document_sha256: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: number | null;
  reviewed_at: DbDate | null;
  rejection_reason: string | null;
  created_at: DbDate;
}

interface ListingRow {
  id: number;
  uuid: string;
  donor_id: number;
  campaign_id: number;
  title: string;
  description: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  category: string;
  images: string[];
  starting_price: number | string;
  reserve_price: number | string | null;
  buy_now_price: number | string | null;
  current_bid: number | string;
  bid_count: number;
  status: ListingStatus;
  start_time: DbDate;
  end_time: DbDate;
  winner_id: number | null;
  charity_name: string;
  min_increment: number | string;
  review_note: string | null;
  created_at: DbDate;
}

interface BidRow {
  id: number;
  uuid: string;
  listing_id: number;
  bidder_id: number;
  bidder_username: string;
  amount: number | string;
  is_auto_bid: boolean;
  created_at: DbDate;
}

interface DeliveryRow {
  id: number;
  uuid: string;
  listing_id: number;
  tracking_number: string | null;
  courier: string | null;
  shipped_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
}

interface AutoBidRow {
  id: number;
  uuid: string;
  listing_id: number;
  bidder_id: number;
  bidder_username: string;
  max_amount: number | string;
  is_active: boolean;
  created_at: DbDate;
  updated_at: DbDate;
}

interface AutoBidWithListingRow extends AutoBidRow {
  listing_title?: string;
  listing_uuid?: string;
  listing_status?: ListingStatus;
  current_bid?: number | string;
  end_time?: DbDate;
}

interface PaymentRow {
  id: number;
  uuid: string;
  listing_id: number;
  bidder_id: number;
  amount: number | string;
  payment_ref: string;
  escrow_state: 'not_held' | 'held' | 'released' | 'refunded';
  status: 'pending' | 'successful' | 'failed' | 'expired';
  payment_deadline: DbDate;
  offered_at: DbDate;
  paid_at: DbDate | null;
  created_at: DbDate;
  updated_at: DbDate;
}

interface PaymentWithListingRow extends PaymentRow {
  listing_title?: string;
  listing_uuid?: string;
  charity_name?: string;
  has_shipping?: boolean;
}

interface AuditEventRow {
  id: number;
  timestamp: DbDate;
  actor_user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  payload: unknown;
  previous_hash: string;
  current_hash: string;
}

interface ReceiptRow {
  id: number;
  uuid: string;
  payment_id: number;
  listing_id: number;
  bidder_id: number;
  item_title: string;
  amount: number | string;
  charity_name: string;
  receipt_ref: string;
  integrity_hash: string;
  generated_at: DbDate;
}

const USER_ROLES = new Set<UserRole>(['bidder', 'donor', 'charity_staff', 'charity', 'admin']);

const firstRow = async <T>(sql: string, params?: unknown[]): Promise<T | undefined> => {
  const result = await query(sql, params);
  return result.rows[0] as T | undefined;
};

const allRows = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
  const result = await query(sql, params);
  return result.rows as T[];
};

const toIso = (value: DbDate): string => new Date(value).toISOString();
const toDate = (value: DbDate): Date => new Date(value);
const optionalDate = (value: DbDate | null | undefined): Date | undefined => value ? toDate(value) : undefined;
const optionalIso = (value: DbDate | null | undefined): string | undefined => value ? toIso(value) : undefined;
const optionalNumber = (value: number | string | null | undefined): number | undefined => value === null || value === undefined ? undefined : Number(value);

const mapRoles = (roles: unknown): UserRole[] => {
  if (!Array.isArray(roles)) return [];
  return roles.filter((role): role is UserRole => USER_ROLES.has(role as UserRole));
};

const mapPayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
};

const mapUser = (row: UserRow): User => ({
  id: Number(row.id),
  uuid: row.uuid,
  email: row.email,
  username: row.username,
  full_name: row.full_name,
  roles: mapRoles(row.roles),
  passwordHash: row.password_hash,
  is_verified: row.is_verified,
  is_active: row.is_active,
  failedLoginAttempts: Number(row.failed_login_attempts),
  lockedUntil: optionalDate(row.locked_until),
  contactNumber: row.contact_number ?? undefined,
  charityId: optionalNumber(row.charity_id),
  lastLoginAt: optionalIso(row.last_login_at),
  created_at: toIso(row.created_at),
});

const mapPendingRegistration = (row: PendingRegistrationRow): PendingRegistration => ({
  id: row.id,
  email: row.email,
  username: row.username,
  full_name: row.full_name,
  passwordHash: row.password_hash,
  roles: mapRoles(row.roles),
  otpHash: row.otp_hash,
  expiresAt: toDate(row.expires_at),
  attempts: Number(row.attempts),
  createdAt: toDate(row.created_at),
});

const mapLoginOtp = (row: LoginOtpRow): LoginOtp => ({
  user_id: Number(row.user_id),
  email: row.email,
  otpHash: row.otp_hash,
  expiresAt: toDate(row.expires_at),
  attempts: Number(row.attempts),
  createdAt: toDate(row.created_at),
});

const mapEmailChangeRequest = (row: EmailChangeRequestRow): EmailChangeRequest => ({
  user_id: Number(row.user_id),
  newEmail: row.new_email,
  oldEmail: row.old_email,
  oldEmailOtpHash: row.old_email_otp_hash,
  newEmailOtpHash: row.new_email_otp_hash,
  oldEmailConfirmed: row.old_email_confirmed,
  expiresAt: toDate(row.expires_at),
  attempts: Number(row.attempts),
  createdAt: toDate(row.created_at),
});

const mapSession = (row: SessionRow): SessionRecord => ({
  sid: row.sid,
  userId: Number(row.user_id),
  jtiHash: row.jti_hash,
  csrfTokenHash: row.csrf_token_hash,
  expiresAt: toDate(row.expires_at),
  absoluteExpiresAt: toDate(row.absolute_expires_at),
  revokedAt: optionalDate(row.revoked_at),
  createdAt: toDate(row.created_at),
  lastSeenAt: toDate(row.last_seen_at),
});

const mapPasswordResetToken = (row: PasswordResetTokenRow): PasswordResetToken => ({
  email: row.email,
  tokenHash: row.token_hash,
  expiresAt: toDate(row.expires_at),
  attempts: Number(row.attempts),
  createdAt: toDate(row.created_at),
});

const mapCharity = (row: CharityRow): CharityOrganisation => ({
  id: Number(row.id),
  uuid: row.uuid,
  ownerUserId: Number(row.owner_user_id),
  organisationName: row.organisation_name,
  description: row.description,
  documentName: row.document_name,
  documentMime: row.document_mime,
  documentSha256: row.document_sha256,
  status: row.status,
  reviewedBy: optionalNumber(row.reviewed_by),
  reviewedAt: optionalIso(row.reviewed_at),
  rejectionReason: row.rejection_reason ?? undefined,
  created_at: toIso(row.created_at),
});

const mapListing = (row: ListingRow): Listing => ({
  id: Number(row.id),
  uuid: row.uuid,
  donor_id: Number(row.donor_id),
  campaign_id: Number(row.campaign_id),
  title: row.title,
  description: row.description,
  condition: row.condition,
  category: row.category,
  images: Array.isArray(row.images) ? row.images : [],
  starting_price: Number(row.starting_price),
  reserve_price: optionalNumber(row.reserve_price),
  buy_now_price: optionalNumber(row.buy_now_price),
  current_bid: Number(row.current_bid),
  bid_count: Number(row.bid_count),
  status: row.status,
  start_time: toIso(row.start_time),
  end_time: toIso(row.end_time),
  winner_id: optionalNumber(row.winner_id),
  charityName: row.charity_name,
  min_increment: Number(row.min_increment),
  review_note: row.review_note ?? undefined,
  created_at: toIso(row.created_at),
});

const mapBid = (row: BidRow): Bid => ({
  id: Number(row.id),
  uuid: row.uuid,
  listing_id: Number(row.listing_id),
  bidder_id: Number(row.bidder_id),
  bidder_username: row.bidder_username,
  amount: Number(row.amount),
  is_auto_bid: row.is_auto_bid,
  created_at: toIso(row.created_at),
});

const mapAutoBid = (row: AutoBidRow): AutoBidSetting => ({
  id: Number(row.id),
  uuid: row.uuid,
  listing_id: Number(row.listing_id),
  bidder_id: Number(row.bidder_id),
  bidder_username: row.bidder_username,
  max_amount: Number(row.max_amount),
  is_active: row.is_active,
  created_at: toIso(row.created_at),
  updated_at: toIso(row.updated_at),
});

const mapAutoBidWithListing = (row: AutoBidWithListingRow): AutoBidWithListing => ({
  ...mapAutoBid(row),
  listingTitle: row.listing_title ?? undefined,
  listingUuid: row.listing_uuid ?? undefined,
  listingStatus: row.listing_status ?? undefined,
  currentBid: optionalNumber(row.current_bid),
  endTime: optionalIso(row.end_time),
});

const mapPayment = (row: PaymentRow): Payment => ({
  id: Number(row.id),
  uuid: row.uuid,
  listing_id: Number(row.listing_id),
  bidder_id: Number(row.bidder_id),
  amount: Number(row.amount),
  payment_ref: row.payment_ref,
  escrow_state: row.escrow_state,
  status: row.status,
  payment_deadline: toIso(row.payment_deadline),
  offered_at: toIso(row.offered_at),
  paid_at: optionalIso(row.paid_at),
  created_at: toIso(row.created_at),
  updated_at: toIso(row.updated_at),
});

const mapDelivery = (row: DeliveryRow): Delivery => ({
  id: Number(row.id),
  uuid: row.uuid,
  listing_id: Number(row.listing_id),
  tracking_number: row.tracking_number ?? undefined,
  courier: row.courier ?? undefined,
  shipped_at: optionalIso(row.shipped_at),
  confirmed_at: optionalIso(row.confirmed_at),
  created_at: toIso(row.created_at),
});

const mapPaymentWithListing = (row: PaymentWithListingRow): PaymentWithListing => ({
  ...mapPayment(row),
  listing_uuid: row.listing_uuid ?? '',
  listing_title: row.listing_title ?? '',
  charity_name: row.charity_name ?? '',
  has_shipping: row.has_shipping ?? false,
});

const mapReceipt = (row: ReceiptRow): Receipt => ({
  id: Number(row.id),
  uuid: row.uuid,
  payment_id: Number(row.payment_id),
  listing_id: Number(row.listing_id),
  bidder_id: Number(row.bidder_id),
  item_title: row.item_title,
  amount: Number(row.amount),
  charity_name: row.charity_name,
  receipt_ref: row.receipt_ref,
  integrity_hash: row.integrity_hash,
  generated_at: toIso(row.generated_at),
});

const mapAuditEvent = (row: AuditEventRow): AuditEvent => ({
  id: Number(row.id),
  timestamp: toIso(row.timestamp),
  actorUserId: optionalNumber(row.actor_user_id),
  action: row.action,
  resourceType: row.resource_type ?? undefined,
  resourceId: row.resource_id ?? undefined,
  ipHash: row.ip_hash ?? undefined,
  userAgentHash: row.user_agent_hash ?? undefined,
  payload: mapPayload(row.payload),
  previousHash: row.previous_hash,
  currentHash: row.current_hash,
});

const redactPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const sensitive = /password|token|cookie|csrf|secret|otp|authorization/i;
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, sensitive.test(key) ? '[REDACTED]' : value]));
};

const toPublicUser: BidForGoodRepository['toPublicUser'] = (user) => {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
};

const userRolesInclude = (user: PublicUser, role: UserRole): boolean => user.roles.includes(role);

const findUserByEmail = async (email: string): Promise<User | undefined> => {
  const row = await firstRow<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
  return row ? mapUser(row) : undefined;
};

const findUserByUsername = async (username: string): Promise<User | undefined> => {
  const row = await firstRow<UserRow>('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [username]);
  return row ? mapUser(row) : undefined;
};

const findUserById = async (id: number): Promise<User | undefined> => {
  const row = await firstRow<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return row ? mapUser(row) : undefined;
};

const findUserByUuid = async (uuid: string): Promise<User | undefined> => {
  const row = await firstRow<UserRow>('SELECT * FROM users WHERE uuid = $1 LIMIT 1', [uuid]);
  return row ? mapUser(row) : undefined;
};

const addUser = async (input: NewUserInput): Promise<User> => {
  const row = await firstRow<UserRow>(
    `INSERT INTO users (email, username, full_name, roles, password_hash, is_verified, is_active, failed_login_attempts, charity_id)
     VALUES ($1, $2, $3, $4, $5, $6, true, 0, $7)
     RETURNING *`,
    [input.email, input.username, input.full_name, input.roles, input.passwordHash, input.is_verified, input.charityId ?? null],
  );
  if (!row) throw new Error('Failed to create user.');
  return mapUser(row);
};

const updateUser = async (user: User): Promise<void> => {
  await query(
    `UPDATE users
     SET email = $2, username = $3, full_name = $4, contact_number = $5, roles = $6,
         password_hash = $7, is_verified = $8, is_active = $9, failed_login_attempts = $10,
         locked_until = $11, charity_id = $12, last_login_at = $13
     WHERE id = $1`,
    [
      user.id,
      user.email,
      user.username,
      user.full_name,
      user.contactNumber ?? null,
      user.roles,
      user.passwordHash,
      user.is_verified,
      user.is_active,
      user.failedLoginAttempts,
      user.lockedUntil ?? null,
      user.charityId ?? null,
      user.lastLoginAt ?? null,
    ],
  );
};

const listStaffByCharityId = async (charityId: number): Promise<User[]> => {
  const rows = await allRows<UserRow>(
    `SELECT * FROM users WHERE charity_id = $1 AND 'charity_staff' = ANY(roles) ORDER BY created_at DESC, id DESC`,
    [charityId],
  );
  return rows.map(mapUser);
};

export const savePendingRegistration = async (registration: PendingRegistration): Promise<void> => {
  await query(
    `INSERT INTO pending_registrations
       (id, email, username, full_name, password_hash, roles, otp_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (email) DO UPDATE SET
       id = EXCLUDED.id,
       username = EXCLUDED.username,
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       roles = EXCLUDED.roles,
       otp_hash = EXCLUDED.otp_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = EXCLUDED.attempts,
       created_at = EXCLUDED.created_at`,
    [
      registration.id,
      registration.email,
      registration.username,
      registration.full_name,
      registration.passwordHash,
      registration.roles,
      registration.otpHash,
      registration.expiresAt,
      registration.attempts,
      registration.createdAt,
    ],
  );
};

export const getPendingRegistration = async (email: string): Promise<PendingRegistration | undefined> => {
  const row = await firstRow<PendingRegistrationRow>('SELECT * FROM pending_registrations WHERE lower(email) = lower($1) LIMIT 1', [email]);
  return row ? mapPendingRegistration(row) : undefined;
};

const removePendingRegistration = async (email: string): Promise<void> => {
  await query('DELETE FROM pending_registrations WHERE lower(email) = lower($1)', [email]);
};

const saveLoginOtp = async (otp: LoginOtp): Promise<void> => {
  await query(
    `INSERT INTO login_otps (user_id, email, otp_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       email = EXCLUDED.email,
       otp_hash = EXCLUDED.otp_hash,
       expires_at = EXCLUDED.expires_at,
       attempts = EXCLUDED.attempts,
       created_at = EXCLUDED.created_at`,
    [
      otp.user_id,
      otp.email,
      otp.otpHash,
      otp.expiresAt,
      otp.attempts,
      otp.createdAt,
    ],
  );
};

const getLoginOtp = async (userId: number): Promise<LoginOtp | undefined> => {
  const row = await firstRow<LoginOtpRow>('SELECT * FROM login_otps WHERE user_id = $1 LIMIT 1', [userId]);
  return row ? mapLoginOtp(row) : undefined;
};

const removeLoginOtp = async (userId: number): Promise<void> => {
  await query('DELETE FROM login_otps WHERE user_id = $1', [userId]);
};

const saveEmailChangeRequest = async (request: EmailChangeRequest): Promise<void> => {
  await query(
    `INSERT INTO email_change_requests (user_id, new_email, old_email, old_email_otp_hash, new_email_otp_hash, old_email_confirmed, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id) DO UPDATE SET
       new_email = EXCLUDED.new_email,
       old_email = EXCLUDED.old_email,
       old_email_otp_hash = EXCLUDED.old_email_otp_hash,
       new_email_otp_hash = EXCLUDED.new_email_otp_hash,
       old_email_confirmed = EXCLUDED.old_email_confirmed,
       expires_at = EXCLUDED.expires_at,
       attempts = EXCLUDED.attempts,
       created_at = EXCLUDED.created_at`,
    [
      request.user_id,
      request.newEmail,
      request.oldEmail,
      request.oldEmailOtpHash,
      request.newEmailOtpHash,
      request.oldEmailConfirmed,
      request.expiresAt,
      request.attempts,
      request.createdAt,
    ],
  );
};

const getEmailChangeRequest = async (userId: number): Promise<EmailChangeRequest | undefined> => {
  const row = await firstRow<EmailChangeRequestRow>('SELECT * FROM email_change_requests WHERE user_id = $1 LIMIT 1', [userId]);
  return row ? mapEmailChangeRequest(row) : undefined;
};

const removeEmailChangeRequest = async (userId: number): Promise<void> => {
  await query('DELETE FROM email_change_requests WHERE user_id = $1', [userId]);
};

const addSession = async (record: SessionRecord): Promise<void> => {
  await query(
    `INSERT INTO sessions (sid, user_id, jti_hash, csrf_token_hash, expires_at, absolute_expires_at, revoked_at, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (sid) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       jti_hash = EXCLUDED.jti_hash,
       csrf_token_hash = EXCLUDED.csrf_token_hash,
       expires_at = EXCLUDED.expires_at,
       revoked_at = EXCLUDED.revoked_at,
       last_seen_at = EXCLUDED.last_seen_at`,
    [record.sid, record.userId, record.jtiHash, record.csrfTokenHash, record.expiresAt, record.absoluteExpiresAt, record.revokedAt ?? null, record.createdAt, record.lastSeenAt],
  );
};

const getSession = async (sid: string): Promise<SessionRecord | undefined> => {
  const row = await firstRow<SessionRow>('SELECT * FROM sessions WHERE sid = $1 LIMIT 1', [sid]);
  return row ? mapSession(row) : undefined;
};

const updateSession = async (record: SessionRecord): Promise<void> => addSession(record);

const revokeSession = async (sid: string): Promise<void> => {
  await query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE sid = $1', [sid]);
};

const revokeAllSessionsByUserId = async (userId: number): Promise<void> => {
  await query('UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
};

const savePasswordResetToken = async (token: PasswordResetToken): Promise<void> => {
  await query(
    `INSERT INTO password_reset_tokens (email, token_hash, expires_at, attempts, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, attempts = EXCLUDED.attempts, created_at = EXCLUDED.created_at`,
    [token.email, token.tokenHash, token.expiresAt, token.attempts, token.createdAt],
  );
};

const getPasswordResetTokenByEmail = async (email: string): Promise<PasswordResetToken | undefined> => {
  const row = await firstRow<PasswordResetTokenRow>('SELECT * FROM password_reset_tokens WHERE email = $1 LIMIT 1', [email]);
  return row ? mapPasswordResetToken(row) : undefined;
};

const removePasswordResetToken = async (email: string): Promise<void> => {
  await query('DELETE FROM password_reset_tokens WHERE email = $1', [email]);
};

const addCharity = async (input: NewCharityInput): Promise<CharityOrganisation> => {
  const row = await firstRow<CharityRow>(
    `INSERT INTO charities
       (owner_user_id, organisation_name, description, document_name, document_mime, document_sha256, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [input.ownerUserId, input.organisationName, input.description, input.documentName, input.documentMime, input.documentSha256],
  );
  if (!row) throw new Error('Failed to create charity registration.');
  return mapCharity(row);
};

const getCharityByUuid = async (uuid: string): Promise<CharityOrganisation | undefined> => {
  const row = await firstRow<CharityRow>('SELECT * FROM charities WHERE uuid = $1 LIMIT 1', [uuid]);
  return row ? mapCharity(row) : undefined;
};

const getCharityByOwnerUserId = async (ownerUserId: number): Promise<CharityOrganisation | undefined> => {
  const row = await firstRow<CharityRow>('SELECT * FROM charities WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 1', [ownerUserId]);
  return row ? mapCharity(row) : undefined;
};

const listCharities = async (): Promise<CharityOrganisation[]> => {
  const rows = await allRows<CharityRow>('SELECT * FROM charities ORDER BY created_at DESC, id DESC');
  return rows.map(mapCharity);
};

const updateCharity = async (record: CharityOrganisation): Promise<void> => {
  await query(
    `UPDATE charities
     SET owner_user_id = $2, organisation_name = $3, description = $4, document_name = $5,
         document_mime = $6, document_sha256 = $7, status = $8, reviewed_by = $9,
         reviewed_at = $10, rejection_reason = $11
     WHERE uuid = $1`,
    [
      record.uuid,
      record.ownerUserId,
      record.organisationName,
      record.description,
      record.documentName,
      record.documentMime,
      record.documentSha256,
      record.status,
      record.reviewedBy ?? null,
      record.reviewedAt ?? null,
      record.rejectionReason ?? null,
    ],
  );
};

const getCharityById = async (id: number): Promise<CharityOrganisation | undefined> => {
  const row = await firstRow<CharityRow>('SELECT * FROM charities WHERE id = $1 LIMIT 1', [id]);
  return row ? mapCharity(row) : undefined;
};

interface CampaignListRow {
  id: number;
  uuid: string;
  charity_id: number;
  name: string;
  description: string;
  status: 'active' | 'closed';
  end_date: string | null;
  has_image: boolean;
  total_raised: string;
  active_auctions: string;
  created_at: DbDate;
}

interface CampaignImageRow {
  image_data: Buffer | null;
  image_mime: string | null;
}

const CAMPAIGN_LIST_SQL = `
  SELECT
    c.id, c.uuid, c.charity_id, c.name, c.description, c.status, c.end_date,
    (c.image_data IS NOT NULL) AS has_image,
    COALESCE((
      SELECT SUM(l.current_bid) FROM listings l
      WHERE l.campaign_id = c.id AND l.status = 'sold'
    ), 0) AS total_raised,
    COALESCE((
      SELECT COUNT(*) FROM listings l
      WHERE l.campaign_id = c.id AND l.status = 'active'
    ), 0) AS active_auctions,
    c.created_at
  FROM campaigns c`;

const mapCampaign = (row: CampaignListRow): Campaign => ({
  id: Number(row.id),
  uuid: row.uuid,
  charity_id: Number(row.charity_id),
  name: row.name,
  description: row.description,
  status: row.status,
  end_date: row.end_date ?? undefined,
  hasImage: row.has_image,
  total_raised: Number(row.total_raised),
  active_auctions: Number(row.active_auctions),
  created_at: toIso(row.created_at),
});

const addCampaign = async (input: NewCampaignInput): Promise<Campaign> => {
  const row = await firstRow<CampaignListRow>(
    `WITH inserted AS (
       INSERT INTO campaigns (charity_id, name, description, status, end_date, image_data, image_mime)
       VALUES ($1, $2, $3, 'active', $4, $5, $6)
       RETURNING id, uuid, charity_id, name, description, status, end_date, image_data, created_at
     )
     SELECT i.id, i.uuid, i.charity_id, i.name, i.description, i.status, i.end_date,
            (i.image_data IS NOT NULL) AS has_image,
            0::numeric AS total_raised, 0::bigint AS active_auctions,
            i.created_at
     FROM inserted i`,
    [input.charityId, input.name, input.description, input.endDate ?? null, input.imageData ?? null, input.imageMime ?? null],
  );
  if (!row) throw new Error('Failed to create campaign.');
  return mapCampaign(row);
};

const getCampaignByUuid = async (uuid: string): Promise<Campaign | undefined> => {
  const row = await firstRow<CampaignListRow>(
    `${CAMPAIGN_LIST_SQL} WHERE c.uuid = $1`,
    [uuid],
  );
  return row ? mapCampaign(row) : undefined;
};

const getCampaignImage = async (uuid: string): Promise<{ data: Buffer; mime: string } | undefined> => {
  const row = await firstRow<CampaignImageRow>(
    'SELECT image_data, image_mime FROM campaigns WHERE uuid = $1 LIMIT 1',
    [uuid],
  );
  if (!row || !row.image_data || !row.image_mime) return undefined;
  return { data: row.image_data, mime: row.image_mime };
};

const listCampaignsByCharity = async (charityId: number): Promise<Campaign[]> => {
  const rows = await allRows<CampaignListRow>(
    `${CAMPAIGN_LIST_SQL} WHERE c.charity_id = $1 ORDER BY c.created_at DESC, c.id DESC`,
    [charityId],
  );
  return rows.map(mapCampaign);
};

// Public: all active campaigns across all charities (for the donor listing creation form).
const listAllActiveCampaigns = async (): Promise<Campaign[]> => {
  const rows = await allRows<CampaignListRow>(
    `${CAMPAIGN_LIST_SQL} WHERE c.status = 'active' ORDER BY c.name ASC, c.id ASC`,
  );
  return rows.map(mapCampaign);
};

// Look up a campaign by numeric ID (used in listing.service.ts to resolve charityName).
const getCampaignById = async (id: number): Promise<Campaign | undefined> => {
  const row = await firstRow<CampaignListRow>(`${CAMPAIGN_LIST_SQL} WHERE c.id = $1 LIMIT 1`, [id]);
  return row ? mapCampaign(row) : undefined;
};

const updateCampaign = async (uuid: string, input: UpdateCampaignInput): Promise<Campaign> => {
  const imageClause = input.imageData !== undefined
    ? ', image_data = $5, image_mime = $6'
    : '';
  const params: unknown[] = [uuid, input.name, input.description, input.endDate ?? null];
  if (input.imageData !== undefined) {
    params.push(input.imageData ?? null, input.imageMime ?? null);
  }
  const row = await firstRow<CampaignListRow>(
    `WITH updated AS (
       UPDATE campaigns
       SET name = $2, description = $3, end_date = $4${imageClause}
       WHERE uuid = $1
       RETURNING id, uuid, charity_id, name, description, status, end_date, image_data, created_at
     )
     SELECT u.id, u.uuid, u.charity_id, u.name, u.description, u.status, u.end_date,
            (u.image_data IS NOT NULL) AS has_image,
            COALESCE((SELECT SUM(l.current_bid) FROM listings l WHERE l.campaign_id = u.id AND l.status = 'sold'), 0) AS total_raised,
            COALESCE((SELECT COUNT(*) FROM listings l WHERE l.campaign_id = u.id AND l.status = 'active'), 0) AS active_auctions,
            u.created_at
     FROM updated u`,
    params,
  );
  if (!row) throw new Error('Campaign not found or update failed.');
  return mapCampaign(row);
};

const closeCampaign = async (uuid: string): Promise<Campaign> => {
  const row = await firstRow<CampaignListRow>(
    `WITH closed AS (
       UPDATE campaigns SET status = 'closed' WHERE uuid = $1
       RETURNING id, uuid, charity_id, name, description, status, end_date, image_data, created_at
     )
     SELECT c.id, c.uuid, c.charity_id, c.name, c.description, c.status, c.end_date,
            (c.image_data IS NOT NULL) AS has_image,
            COALESCE((SELECT SUM(l.current_bid) FROM listings l WHERE l.campaign_id = c.id AND l.status = 'sold'), 0) AS total_raised,
            COALESCE((SELECT COUNT(*) FROM listings l WHERE l.campaign_id = c.id AND l.status = 'active'), 0) AS active_auctions,
            c.created_at
     FROM closed c`,
    [uuid],
  );
  if (!row) throw new Error('Campaign not found.');
  return mapCampaign(row);
};

const addListing = async (input: NewListingInput): Promise<Listing> => {
  const row = await firstRow<ListingRow>(
    `INSERT INTO listings
       (donor_id, campaign_id, title, description, condition, category, images, starting_price,
        reserve_price, buy_now_price, current_bid, bid_count, status, start_time, end_time,
        charity_name, min_increment, review_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, 0, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      input.donor_id,
      input.campaign_id,
      input.title,
      input.description,
      input.condition,
      input.category,
      input.images,
      input.starting_price,
      input.reserve_price ?? null,
      input.buy_now_price ?? null,
      input.status,
      input.start_time,
      input.end_time,
      input.charityName,
      input.min_increment,
      input.review_note ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create listing.');
  return mapListing(row);
};

const getListingById = async (id: number): Promise<Listing | undefined> => {
  const row = await firstRow<ListingRow>('SELECT * FROM listings WHERE id = $1 LIMIT 1', [id]);
  return row ? mapListing(row) : undefined;
};

const getListingByUuid = async (uuid: string): Promise<Listing | undefined> => {
  const row = await firstRow<ListingRow>('SELECT * FROM listings WHERE uuid = $1 LIMIT 1', [uuid]);
  return row ? mapListing(row) : undefined;
};

const updateListing = async (listing: Listing): Promise<void> => {
  await query(
    `UPDATE listings
     SET donor_id = $2, campaign_id = $3, title = $4, description = $5, condition = $6,
         category = $7, images = $8, starting_price = $9, reserve_price = $10,
         buy_now_price = $11, current_bid = $12, bid_count = $13, status = $14,
         start_time = $15, end_time = $16, winner_id = $17, charity_name = $18,
         min_increment = $19, review_note = $20
     WHERE id = $1`,
    [
      listing.id,
      listing.donor_id,
      listing.campaign_id,
      listing.title,
      listing.description,
      listing.condition,
      listing.category,
      listing.images,
      listing.starting_price,
      listing.reserve_price ?? null,
      listing.buy_now_price ?? null,
      listing.current_bid,
      listing.bid_count,
      listing.status,
      listing.start_time,
      listing.end_time,
      listing.winner_id ?? null,
      listing.charityName,
      listing.min_increment,
      listing.review_note ?? null,
    ],
  );
};

const listListings = async (): Promise<Listing[]> => {
  const rows = await allRows<ListingRow>('SELECT * FROM listings ORDER BY created_at DESC, id DESC');
  return rows.map(mapListing);
};

const listActiveListings = async (): Promise<Listing[]> => {
  const rows = await allRows<ListingRow>("SELECT * FROM listings WHERE status = 'active' ORDER BY created_at DESC, id DESC");
  return rows.map(mapListing);
};

const listPendingListings = async (): Promise<Listing[]> => {
  const rows = await allRows<ListingRow>("SELECT * FROM listings WHERE status = 'pending' ORDER BY created_at DESC, id DESC");
  return rows.map(mapListing);
};

// SFR09 stage 2: listings the admin has approved and forwarded to the charity for review.
const listCharityReviewQueue = async (): Promise<Listing[]> => {
  const rows = await allRows<ListingRow>("SELECT * FROM listings WHERE status = 'charity_review' ORDER BY created_at DESC, id DESC");
  return rows.map(mapListing);
};

const listUsers = async (): Promise<User[]> => {
  const rows = await allRows<UserRow>('SELECT * FROM users ORDER BY created_at DESC, id DESC');
  return rows.map(mapUser);
};

const listListingsByDonor = async (donorId: number): Promise<Listing[]> => {
  const rows = await allRows<ListingRow>('SELECT * FROM listings WHERE donor_id = $1 ORDER BY created_at DESC, id DESC', [donorId]);
  return rows.map(mapListing);
};

const addBid = async (input: NewBidInput): Promise<Bid> => {
  const row = await firstRow<BidRow>(
    `INSERT INTO bids (listing_id, bidder_id, bidder_username, amount, is_auto_bid)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.listing_id, input.bidder_id, input.bidder_username, input.amount, input.is_auto_bid],
  );
  if (!row) throw new Error('Failed to create bid.');
  return mapBid(row);
};

const getBidsForListing = async (listingId: number): Promise<Bid[]> => {
  const rows = await allRows<BidRow>('SELECT * FROM bids WHERE listing_id = $1 ORDER BY amount DESC, created_at ASC', [listingId]);
  return rows.map(mapBid);
};

interface BidWithListingRow extends BidRow {
  listing_title?: string;
  listing_uuid?: string;
}

const mapBidWithListing = (row: BidWithListingRow): BidWithListing => ({
  ...mapBid(row),
  listingTitle: row.listing_title ?? undefined,
  listingUuid: row.listing_uuid ?? undefined,
});

const getBidsByBidder = async (bidderId: number): Promise<BidWithListing[]> => {
  const rows = await allRows<BidWithListingRow>(
    `SELECT b.*, l.title AS listing_title, l.uuid AS listing_uuid
     FROM bids b
     LEFT JOIN listings l ON b.listing_id = l.id
     WHERE b.bidder_id = $1
     ORDER BY b.created_at DESC, b.id DESC`,
    [bidderId]
  );
  return rows.map(mapBidWithListing);
};

const upsertAutoBid = async (input: NewAutoBidInput): Promise<AutoBidSetting> => {
  const row = await firstRow<AutoBidRow>(
    `INSERT INTO auto_bids (listing_id, bidder_id, bidder_username, max_amount, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (listing_id, bidder_id) DO UPDATE SET
       bidder_username = EXCLUDED.bidder_username,
       max_amount = EXCLUDED.max_amount,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING *`,
    [input.listing_id, input.bidder_id, input.bidder_username, input.max_amount, input.is_active],
  );
  if (!row) throw new Error('Failed to save auto-bid setting.');
  return mapAutoBid(row);
};

const getAutoBidForBidder = async (listingId: number, bidderId: number): Promise<AutoBidSetting | undefined> => {
  const row = await firstRow<AutoBidRow>(
    'SELECT * FROM auto_bids WHERE listing_id = $1 AND bidder_id = $2 LIMIT 1',
    [listingId, bidderId],
  );
  return row ? mapAutoBid(row) : undefined;
};

const listActiveAutoBidsForListing = async (listingId: number): Promise<AutoBidSetting[]> => {
  const rows = await allRows<AutoBidRow>(
    `SELECT * FROM auto_bids
     WHERE listing_id = $1 AND is_active = true
     ORDER BY max_amount DESC, updated_at ASC, id ASC`,
    [listingId],
  );
  return rows.map(mapAutoBid);
};

const listAutoBidsByBidder = async (bidderId: number): Promise<AutoBidWithListing[]> => {
  const rows = await allRows<AutoBidWithListingRow>(
    `SELECT
       a.*,
       l.title AS listing_title,
       l.uuid AS listing_uuid,
       l.status AS listing_status,
       l.current_bid AS current_bid,
       l.end_time AS end_time
     FROM auto_bids a
     INNER JOIN listings l ON l.id = a.listing_id
     WHERE a.bidder_id = $1
     ORDER BY a.is_active DESC, a.updated_at DESC, a.id DESC`,
    [bidderId],
  );
  return rows.map(mapAutoBidWithListing);
};

const deactivateAutoBid = async (listingId: number, bidderId: number): Promise<AutoBidSetting | undefined> => {
  const row = await firstRow<AutoBidRow>(
    `UPDATE auto_bids
     SET is_active = false, updated_at = NOW()
     WHERE listing_id = $1 AND bidder_id = $2
     RETURNING *`,
    [listingId, bidderId],
  );
  return row ? mapAutoBid(row) : undefined;
};

const withListingLock = async <T>(listingId: number, fn: () => Promise<T>): Promise<T> =>
  withTransaction(async () => {
    await query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
    return fn();
  });

const addDelivery = async (listingId: number): Promise<Delivery> => {
  const row = await firstRow<DeliveryRow>(
    'INSERT INTO deliveries (listing_id) VALUES ($1) RETURNING *',
    [listingId],
  );
  if (!row) throw new Error('Failed to create delivery record.');
  return mapDelivery(row);
};

const getDeliveryByListingId = async (listingId: number): Promise<Delivery | undefined> => {
  const row = await firstRow<DeliveryRow>('SELECT * FROM deliveries WHERE listing_id = $1 LIMIT 1', [listingId]);
  return row ? mapDelivery(row) : undefined;
};

const updateDelivery = async (delivery: Delivery): Promise<void> => {
  await query(
    `UPDATE deliveries
     SET tracking_number = $2, courier = $3, shipped_at = $4, confirmed_at = $5
     WHERE id = $1`,
    [delivery.id, delivery.tracking_number ?? null, delivery.courier ?? null, delivery.shipped_at ?? null, delivery.confirmed_at ?? null],
  );
};

const addReceipt = async (input: {
  payment_id: number;
  listing_id: number;
  bidder_id: number;
  item_title: string;
  amount: number;
  charity_name: string;
  receipt_ref: string;
  integrity_hash: string;
}): Promise<Receipt> => {
  const row = await firstRow<ReceiptRow>(
    `INSERT INTO receipts (payment_id, listing_id, bidder_id, item_title, amount, charity_name, receipt_ref, integrity_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [input.payment_id, input.listing_id, input.bidder_id, input.item_title, input.amount, input.charity_name, input.receipt_ref, input.integrity_hash],
  );
  if (!row) throw new Error('Failed to create receipt.');
  return mapReceipt(row);
};

const getReceiptByUuid = async (uuid: string): Promise<Receipt | undefined> => {
  const row = await firstRow<ReceiptRow>('SELECT * FROM receipts WHERE uuid = $1 LIMIT 1', [uuid]);
  return row ? mapReceipt(row) : undefined;
};

const getReceiptsByBidder = async (bidderId: number): Promise<Receipt[]> => {
  const rows = await allRows<ReceiptRow>('SELECT * FROM receipts WHERE bidder_id = $1 ORDER BY generated_at DESC, id DESC', [bidderId]);
  return rows.map(mapReceipt);
};

const addPayment = async (input: NewPaymentInput): Promise<Payment> => {
  const row = await firstRow<PaymentRow>(
    `INSERT INTO payments
       (listing_id, bidder_id, amount, payment_ref, escrow_state, status, payment_deadline, offered_at, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.listing_id,
      input.bidder_id,
      input.amount,
      input.payment_ref,
      input.escrow_state,
      input.status,
      input.payment_deadline,
      input.offered_at,
      input.paid_at ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create payment offer.');
  return mapPayment(row);
};

const updatePayment = async (payment: Payment): Promise<void> => {
  await query(
    `UPDATE payments
     SET listing_id = $2, bidder_id = $3, amount = $4, payment_ref = $5, escrow_state = $6,
         status = $7, payment_deadline = $8, offered_at = $9, paid_at = $10, updated_at = NOW()
     WHERE id = $1`,
    [
      payment.id,
      payment.listing_id,
      payment.bidder_id,
      payment.amount,
      payment.payment_ref,
      payment.escrow_state,
      payment.status,
      payment.payment_deadline,
      payment.offered_at,
      payment.paid_at ?? null,
    ],
  );
};

const getPaymentByUuid = async (uuid: string): Promise<Payment | undefined> => {
  const row = await firstRow<PaymentRow>('SELECT * FROM payments WHERE uuid = $1 LIMIT 1', [uuid]);
  return row ? mapPayment(row) : undefined;
};

const getPaymentsForListing = async (listingId: number): Promise<Payment[]> => {
  const rows = await allRows<PaymentRow>('SELECT * FROM payments WHERE listing_id = $1 ORDER BY created_at ASC, id ASC', [listingId]);
  return rows.map(mapPayment);
};

const getPendingPaymentForListing = async (listingId: number): Promise<Payment | undefined> => {
  const row = await firstRow<PaymentRow>(
    `SELECT * FROM payments
     WHERE listing_id = $1 AND status = 'pending'
     ORDER BY payment_deadline ASC, id ASC
     LIMIT 1`,
    [listingId],
  );
  return row ? mapPayment(row) : undefined;
};

const listPaymentsByBidder = async (bidderId: number): Promise<PaymentWithListing[]> => {
  const rows = await allRows<PaymentWithListingRow>(
    `SELECT
       p.*,
       l.uuid AS listing_uuid,
       l.title AS listing_title,
       l.charity_name AS charity_name,
       (d.tracking_number IS NOT NULL) AS has_shipping
     FROM payments p
     INNER JOIN listings l ON l.id = p.listing_id
     LEFT JOIN deliveries d ON d.listing_id = p.listing_id
     WHERE p.bidder_id = $1
     ORDER BY
       CASE p.status WHEN 'pending' THEN 0 WHEN 'successful' THEN 1 ELSE 2 END,
       p.payment_deadline ASC,
       p.created_at DESC`,
    [bidderId],
  );
  return rows.map(mapPaymentWithListing);
};

const withPaymentLock = async <T>(paymentId: number, fn: () => Promise<T>): Promise<T> =>
  withTransaction(async () => {
    await query('SELECT id FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
    return fn();
  });

const appendAuditEvent = async (event: NewAuditEventInput): Promise<AuditEvent> =>
  withTransaction(async () => {
    await query('LOCK TABLE audit_events IN SHARE ROW EXCLUSIVE MODE');
    const latest = await firstRow<Pick<AuditEventRow, 'current_hash'>>('SELECT current_hash FROM audit_events ORDER BY id DESC LIMIT 1');
    const previousHash = latest?.current_hash ?? 'GENESIS';
    const payload = redactPayload(event.payload ?? {});
    const timestamp = new Date();
    const currentHash = sha256(JSON.stringify({ ...event, payload, timestamp: timestamp.toISOString(), previousHash }));
    const row = await firstRow<AuditEventRow>(
      `INSERT INTO audit_events
         (timestamp, actor_user_id, action, resource_type, resource_id, ip_hash, user_agent_hash,
          payload, previous_hash, current_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
       RETURNING *`,
      [
        timestamp,
        event.actorUserId ?? null,
        event.action,
        event.resourceType ?? null,
        event.resourceId ?? null,
        event.ipHash ?? null,
        event.userAgentHash ?? null,
        JSON.stringify(payload),
        previousHash,
        currentHash,
      ],
    );
    if (!row) throw new Error('Failed to append audit event.');
    return mapAuditEvent(row);
  });

const listAuditEvents = async (): Promise<AuditEvent[]> => {
  const rows = await allRows<AuditEventRow>('SELECT * FROM audit_events ORDER BY id ASC');
  return rows.map(mapAuditEvent);
};

export const seedDemoData = async (): Promise<void> => {
  const existing = await firstRow<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
  if (existing && Number(existing.count) > 0) return;

  const passwordHash = await argon2.hash('S3cure!Pass2026', { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const demoUsers: Array<Pick<User, 'email' | 'username' | 'full_name' | 'roles'>> = [
    { email: 'admin@bidforgood.test', username: 'admin', full_name: 'Demo Admin', roles: ['admin'] },
    { email: 'donor@bidforgood.test', username: 'donor', full_name: 'Demo Donor', roles: ['donor'] },
    { email: 'bidder@bidforgood.test', username: 'bidder', full_name: 'Demo Bidder', roles: ['bidder'] },
    { email: 'charity@bidforgood.test', username: 'charity', full_name: 'Demo Charity', roles: ['charity'] },
  ];
  const userIds: Record<string, number> = {};
  for (const demoUser of demoUsers) {
    const user = await addUser({ ...demoUser, passwordHash, is_verified: true });
    userIds[demoUser.email] = user.id;
  }

  // Create a demo charity and campaign for listings to link to
  const charity = await addCharity({
    ownerUserId: userIds['charity@bidforgood.test'],
    organisationName: "Children's Hospital Trust",
    description: "Provides medical care for children.",
    documentName: "test-doc.pdf",
    documentMime: "application/pdf",
    documentSha256: "testhash",
  });
  await query("UPDATE charities SET status = 'approved' WHERE id = $1", [charity.id]);

  const campaign = await addCampaign({
    charityId: charity.id,
    name: "Winter Fundraising 2026",
    description: "Raising funds for winter.",
  });

  const demoListings: Array<NewListingInput & { current_bid: number }> = [
    {
      donor_id: userIds['donor@bidforgood.test'], campaign_id: campaign.id, title: 'Signed Premier League Jersey',
      description: 'Signed jersey donated for charity fundraising.', condition: 'good', category: 'Sports', images: [],
      starting_price: 1000, current_bid: 1250, status: 'active', start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), charityName: "Children's Hospital Trust", min_increment: 50,
    },
    {
      donor_id: userIds['donor@bidforgood.test'], campaign_id: campaign.id, title: 'Private Dining Experience',
      description: 'Private dining session for a good cause.', condition: 'new', category: 'Experiences', images: [],
      starting_price: 2000, current_bid: 3800, status: 'active', start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), charityName: 'Food Bank Singapore', min_increment: 100,
    },
    {
      donor_id: userIds['donor@bidforgood.test'], campaign_id: campaign.id, title: 'Pending Vintage Camera',
      description: 'Pending approval; must not appear in public search.', condition: 'fair', category: 'Collectibles', images: [],
      starting_price: 400, current_bid: 400, status: 'pending', start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), charityName: 'Arts for Youth', min_increment: 25,
    },
  ];
  for (const { current_bid, ...listingInput } of demoListings) {
    const listing = await addListing(listingInput);
    if (current_bid !== listing.starting_price) {
      await query('UPDATE listings SET current_bid = $2 WHERE id = $1', [listing.id, current_bid]);
    }
  }
};

export const resetRepositoryForTests = async (): Promise<void> => {
  await query('TRUNCATE TABLE audit_events, auto_bids, payments, bids, listings, campaigns, charities, sessions, pending_registrations, login_otps, password_reset_tokens, email_change_requests, users RESTART IDENTITY CASCADE');
  await seedDemoData();
};

export const postgresRepository: BidForGoodRepository = {
  findUserByEmail,
  findUserByUsername,
  findUserById,
  findUserByUuid,
  addUser,
  updateUser,
  toPublicUser,
  listStaffByCharityId,

  savePendingRegistration,
  getPendingRegistration,
  removePendingRegistration,

  saveLoginOtp,
  getLoginOtp,
  removeLoginOtp,

  saveEmailChangeRequest,
  getEmailChangeRequest,
  removeEmailChangeRequest,

  addSession,
  getSession,
  updateSession,
  revokeSession,
  revokeAllSessionsByUserId,

  savePasswordResetToken,
  getPasswordResetTokenByEmail,
  removePasswordResetToken,

  addCharity,
  getCharityById,
  getCharityByUuid,
  getCharityByOwnerUserId,
  listCharities,
  updateCharity,

  addCampaign,
  getCampaignById,
  getCampaignByUuid,
  getCampaignImage,
  listCampaignsByCharity,
  listAllActiveCampaigns,
  updateCampaign,
  closeCampaign,

  addListing,
  getListingById,
  getListingByUuid,
  updateListing,
  listListings,
  listActiveListings,
  listPendingListings,
  listCharityReviewQueue,
  listListingsByDonor,
  listUsers,

  addBid,
  getBidsForListing,
  getBidsByBidder,
  upsertAutoBid,
  getAutoBidForBidder,
  listActiveAutoBidsForListing,
  listAutoBidsByBidder,
  deactivateAutoBid,
  withListingLock,

  addDelivery,
  getDeliveryByListingId,
  updateDelivery,

  addReceipt,
  getReceiptByUuid,
  getReceiptsByBidder,

  addPayment,
  updatePayment,
  getPaymentByUuid,
  getPaymentsForListing,
  getPendingPaymentForListing,
  listPaymentsByBidder,
  withPaymentLock,

  appendAuditEvent,
  listAuditEvents,

  userRolesInclude,
};