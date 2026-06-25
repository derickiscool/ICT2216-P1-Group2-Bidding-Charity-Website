import crypto from 'crypto';
import argon2 from 'argon2';
import type { AuditEvent, Bid, CharityOrganisation, Listing, PendingRegistration, SessionRecord, User, UserRole } from '../types/domain';
import { sha256 } from '../utils/security';

let userSeq = 1;
let charitySeq = 1;
let listingSeq = 1;
let bidSeq = 1;
let auditSeq = 1;

const users: User[] = [];
const pendingRegistrations = new Map<string, PendingRegistration>();
const sessions = new Map<string, SessionRecord>();
const charities: CharityOrganisation[] = [];
const listings: Listing[] = [];
const bids: Bid[] = [];
const auditEvents: AuditEvent[] = [];

const publicUser = (user: User): Omit<User, 'passwordHash'> => {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
};

const nowIso = () => new Date().toISOString();

export const resetRepositoryForTests = async (): Promise<void> => {
  userSeq = 1; charitySeq = 1; listingSeq = 1; bidSeq = 1; auditSeq = 1;
  users.splice(0); pendingRegistrations.clear(); sessions.clear(); charities.splice(0); listings.splice(0); bids.splice(0); auditEvents.splice(0);
  await seedDemoData();
};

export const seedDemoData = async (): Promise<void> => {
  if (users.length > 0) return;
  const passwordHash = await argon2.hash('S3cure!Pass2026', { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
  const demoUsers: Array<Pick<User, 'email' | 'username' | 'full_name' | 'roles'> & { passwordHash: string }> = [
    { email: 'admin@bidforgood.test', username: 'admin', full_name: 'Demo Admin', roles: ['admin'], passwordHash },
    { email: 'donor@bidforgood.test', username: 'donor', full_name: 'Demo Donor', roles: ['donor'], passwordHash },
    { email: 'bidder@bidforgood.test', username: 'bidder', full_name: 'Demo Bidder', roles: ['bidder'], passwordHash },
    { email: 'charity@bidforgood.test', username: 'charity', full_name: 'Demo Charity', roles: ['charity'], passwordHash }
  ];
  for (const user of demoUsers) {
    users.push({
      id: userSeq++, uuid: crypto.randomUUID(), email: user.email, username: user.username,
      full_name: user.full_name, roles: user.roles, passwordHash: user.passwordHash,
      is_verified: true, is_active: true, failedLoginAttempts: 0, created_at: nowIso()
    });
  }

  listings.push({
    id: listingSeq++, uuid: crypto.randomUUID(), donor_id: 2, campaign_id: 1, title: 'Signed Premier League Jersey',
    description: 'Signed jersey donated for charity fundraising.', condition: 'good', category: 'Sports', images: [], starting_price: 1000,
    current_bid: 1250, bid_count: 0, status: 'active', start_time: nowIso(),
    end_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), charityName: "Children's Hospital Trust", min_increment: 50, created_at: nowIso()
  });
  listings.push({
    id: listingSeq++, uuid: crypto.randomUUID(), donor_id: 2, campaign_id: 1, title: 'Private Dining Experience',
    description: 'Private dining session for a good cause.', condition: 'new', category: 'Experiences', images: [], starting_price: 2000,
    current_bid: 3800, bid_count: 0, status: 'active', start_time: nowIso(),
    end_time: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), charityName: 'Food Bank Singapore', min_increment: 100, created_at: nowIso()
  });
  listings.push({
    id: listingSeq++, uuid: crypto.randomUUID(), donor_id: 2, campaign_id: 1, title: 'Pending Vintage Camera',
    description: 'Pending approval; must not appear in public search.', condition: 'fair', category: 'Collectibles', images: [], starting_price: 400,
    current_bid: 400, bid_count: 0, status: 'pending', start_time: nowIso(),
    end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), charityName: 'Arts for Youth', min_increment: 25, created_at: nowIso()
  });
};

export const findUserByEmail = async (email: string): Promise<User | undefined> => users.find(u => u.email === email);
export const findUserById = async (id: number): Promise<User | undefined> => users.find(u => u.id === id);
export const findUserByUuid = async (uuid: string): Promise<User | undefined> => users.find(u => u.uuid === uuid);
export const addUser = async (input: Omit<User, 'id' | 'uuid' | 'created_at' | 'failedLoginAttempts' | 'is_active'>): Promise<User> => {
  const user: User = { ...input, id: userSeq++, uuid: crypto.randomUUID(), is_active: true, failedLoginAttempts: 0, created_at: nowIso() };
  users.push(user);
  return user;
};
export const updateUser = async (user: User): Promise<void> => {
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user;
};
export const toPublicUser = publicUser;

export const savePendingRegistration = async (reg: PendingRegistration): Promise<void> => { pendingRegistrations.set(reg.email, reg); };
export const getPendingRegistration = async (email: string): Promise<PendingRegistration | undefined> => pendingRegistrations.get(email);
export const removePendingRegistration = async (email: string): Promise<void> => { pendingRegistrations.delete(email); };

export const addSession = async (record: SessionRecord): Promise<void> => { sessions.set(record.sid, record); };
export const getSession = async (sid: string): Promise<SessionRecord | undefined> => sessions.get(sid);
export const updateSession = async (record: SessionRecord): Promise<void> => { sessions.set(record.sid, record); };
export const revokeSession = async (sid: string): Promise<void> => {
  const session = sessions.get(sid);
  if (session) sessions.set(sid, { ...session, revokedAt: new Date() });
};

export const addCharity = async (input: Omit<CharityOrganisation, 'id' | 'uuid' | 'status' | 'created_at'>): Promise<CharityOrganisation> => {
  const record: CharityOrganisation = { ...input, id: charitySeq++, uuid: crypto.randomUUID(), status: 'pending', created_at: nowIso() };
  charities.push(record);
  return record;
};
export const getCharityByUuid = async (uuid: string): Promise<CharityOrganisation | undefined> => charities.find(c => c.uuid === uuid);
export const listCharities = async (): Promise<CharityOrganisation[]> => [...charities];
export const updateCharity = async (record: CharityOrganisation): Promise<void> => {
  const idx = charities.findIndex(c => c.uuid === record.uuid);
  if (idx >= 0) charities[idx] = record;
};

export const addListing = async (input: Omit<Listing, 'id' | 'uuid' | 'created_at' | 'current_bid' | 'bid_count' | 'winner_id'>): Promise<Listing> => {
  const listing: Listing = { ...input, id: listingSeq++, uuid: crypto.randomUUID(), current_bid: input.starting_price, bid_count: 0, created_at: nowIso() };
  listings.push(listing);
  return listing;
};
export const getListingById = async (id: number): Promise<Listing | undefined> => listings.find(l => l.id === id);
export const getListingByUuid = async (uuid: string): Promise<Listing | undefined> => listings.find(l => l.uuid === uuid);
export const updateListing = async (listing: Listing): Promise<void> => {
  const idx = listings.findIndex(l => l.id === listing.id);
  if (idx >= 0) listings[idx] = listing;
};
export const listListings = async (): Promise<Listing[]> => [...listings];
export const listActiveListings = async (): Promise<Listing[]> => listings.filter(l => l.status === 'active');
export const listPendingListings = async (): Promise<Listing[]> => listings.filter(l => l.status === 'pending');

export const addBid = async (input: Omit<Bid, 'id' | 'uuid' | 'created_at'>): Promise<Bid> => {
  const bid: Bid = { ...input, id: bidSeq++, uuid: crypto.randomUUID(), created_at: nowIso() };
  bids.push(bid);
  return bid;
};
export const getBidsForListing = async (listingId: number): Promise<Bid[]> => bids.filter(b => b.listing_id === listingId).sort((a, b) => b.amount - a.amount);

const redactPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const sensitive = /password|token|cookie|csrf|secret|otp|authorization/i;
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, sensitive.test(key) ? '[REDACTED]' : value]));
};

export const appendAuditEvent = async (event: Omit<AuditEvent, 'id' | 'timestamp' | 'previousHash' | 'currentHash' | 'payload'> & { payload?: Record<string, unknown> }): Promise<AuditEvent> => {
  const previousHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].currentHash : 'GENESIS';
  const payload = redactPayload(event.payload ?? {});
  const timestamp = nowIso();
  const currentHash = sha256(JSON.stringify({ ...event, payload, timestamp, previousHash }));
  const record: AuditEvent = { ...event, id: auditSeq++, timestamp, previousHash, currentHash, payload };
  auditEvents.push(record);
  return record;
};
export const listAuditEvents = async (): Promise<AuditEvent[]> => [...auditEvents];

export const userRolesInclude = (user: Omit<User, 'passwordHash'>, role: UserRole): boolean => user.roles.includes(role);

void seedDemoData();
