import argon2 from 'argon2';
import type {
  AuditEvent,
  Bid,
  CharityOrganisation,
  Listing,
  PendingRegistration,
  SessionRecord,
  User,
  UserRole,
} from '../types/domain';
import { query, withTransaction } from '../utils/db';
import { sha256 } from '../utils/security';
import type {
  BidForGoodRepository,
  NewAuditEventInput,
  NewBidInput,
  NewCharityInput,
  NewListingInput,
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

interface SessionRow {
  sid: string;
  user_id: number;
  jti_hash: string;
  csrf_token_hash: string;
  expires_at: DbDate;
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
  status: 'draft' | 'pending' | 'active' | 'sold' | 'expired' | 'cancelled' | 'rejected';
  start_time: DbDate;
  end_time: DbDate;
  winner_id: number | null;
  charity_name: string;
  min_increment: number | string;
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

const mapSession = (row: SessionRow): SessionRecord => ({
  sid: row.sid,
  userId: Number(row.user_id),
  jtiHash: row.jti_hash,
  csrfTokenHash: row.csrf_token_hash,
  expiresAt: toDate(row.expires_at),
  revokedAt: optionalDate(row.revoked_at),
  createdAt: toDate(row.created_at),
  lastSeenAt: toDate(row.last_seen_at),
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

const addSession = async (record: SessionRecord): Promise<void> => {
  await query(
    `INSERT INTO sessions (sid, user_id, jti_hash, csrf_token_hash, expires_at, revoked_at, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (sid) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       jti_hash = EXCLUDED.jti_hash,
       csrf_token_hash = EXCLUDED.csrf_token_hash,
       expires_at = EXCLUDED.expires_at,
       revoked_at = EXCLUDED.revoked_at,
       last_seen_at = EXCLUDED.last_seen_at`,
    [record.sid, record.userId, record.jtiHash, record.csrfTokenHash, record.expiresAt, record.revokedAt ?? null, record.createdAt, record.lastSeenAt],
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

const addListing = async (input: NewListingInput): Promise<Listing> => {
  const row = await firstRow<ListingRow>(
    `INSERT INTO listings
       (donor_id, campaign_id, title, description, condition, category, images, starting_price,
        reserve_price, buy_now_price, current_bid, bid_count, status, start_time, end_time,
        charity_name, min_increment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, 0, $11, $12, $13, $14, $15)
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
         min_increment = $19
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

const withListingLock = async <T>(listingId: number, fn: () => Promise<T>): Promise<T> =>
  withTransaction(async () => {
    await query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
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

  const demoListings: Array<NewListingInput & { current_bid: number }> = [
    {
      donor_id: userIds['donor@bidforgood.test'], campaign_id: 1, title: 'Signed Premier League Jersey',
      description: 'Signed jersey donated for charity fundraising.', condition: 'good', category: 'Sports', images: [],
      starting_price: 1000, current_bid: 1250, status: 'active', start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), charityName: "Children's Hospital Trust", min_increment: 50,
    },
    {
      donor_id: userIds['donor@bidforgood.test'], campaign_id: 1, title: 'Private Dining Experience',
      description: 'Private dining session for a good cause.', condition: 'new', category: 'Experiences', images: [],
      starting_price: 2000, current_bid: 3800, status: 'active', start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), charityName: 'Food Bank Singapore', min_increment: 100,
    },
    {
      donor_id: userIds['donor@bidforgood.test'], campaign_id: 1, title: 'Pending Vintage Camera',
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
  await query('TRUNCATE TABLE audit_events, bids, listings, charities, sessions, pending_registrations, users RESTART IDENTITY CASCADE');
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

  addSession,
  getSession,
  updateSession,
  revokeSession,

  addCharity,
  getCharityByUuid,
  getCharityByOwnerUserId,
  listCharities,
  updateCharity,

  addListing,
  getListingById,
  getListingByUuid,
  updateListing,
  listListings,
  listActiveListings,
  listPendingListings,

  addBid,
  getBidsForListing,
  withListingLock,

  appendAuditEvent,
  listAuditEvents,

  userRolesInclude,
};
