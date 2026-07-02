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

export type PublicUser = Omit<User, 'passwordHash'>;

export type NewUserInput = Omit<User, 'id' | 'uuid' | 'created_at' | 'failedLoginAttempts' | 'is_active'>;
export type NewCharityInput = Omit<CharityOrganisation, 'id' | 'uuid' | 'status' | 'created_at'>;
export type NewListingInput = Omit<Listing, 'id' | 'uuid' | 'created_at' | 'current_bid' | 'bid_count' | 'winner_id'>;
export type NewBidInput = Omit<Bid, 'id' | 'uuid' | 'created_at'>;
export type NewAuditEventInput = Omit<AuditEvent, 'id' | 'timestamp' | 'previousHash' | 'currentHash' | 'payload'> & {
  payload?: Record<string, unknown>;
};

export interface BidForGoodRepository {
  findUserByEmail(email: string): Promise<User | undefined>;
  findUserByUsername(username: string): Promise<User | undefined>;
  findUserById(id: number): Promise<User | undefined>;
  findUserByUuid(uuid: string): Promise<User | undefined>;
  findUserByUsername(username: string): Promise<User | undefined>;
  addUser(input: NewUserInput): Promise<User>;
  updateUser(user: User): Promise<void>;
  toPublicUser(user: User): PublicUser;
  listStaffByCharityId(charityId: number): Promise<User[]>;

  savePendingRegistration(registration: PendingRegistration): Promise<void>;
  getPendingRegistration(email: string): Promise<PendingRegistration | undefined>;
  removePendingRegistration(email: string): Promise<void>;

  addSession(record: SessionRecord): Promise<void>;
  getSession(sid: string): Promise<SessionRecord | undefined>;
  updateSession(record: SessionRecord): Promise<void>;
  revokeSession(sid: string): Promise<void>;

  addCharity(input: NewCharityInput): Promise<CharityOrganisation>;
  getCharityByUuid(uuid: string): Promise<CharityOrganisation | undefined>;
  getCharityByOwnerUserId(ownerUserId: number): Promise<CharityOrganisation | undefined>;
  listCharities(): Promise<CharityOrganisation[]>;
  updateCharity(record: CharityOrganisation): Promise<void>;

  addListing(input: NewListingInput): Promise<Listing>;
  getListingById(id: number): Promise<Listing | undefined>;
  getListingByUuid(uuid: string): Promise<Listing | undefined>;
  updateListing(listing: Listing): Promise<void>;
  listListings(): Promise<Listing[]>;
  listActiveListings(): Promise<Listing[]>;
  listPendingListings(): Promise<Listing[]>;

  addBid(input: NewBidInput): Promise<Bid>;
  getBidsForListing(listingId: number): Promise<Bid[]>;
  withListingLock<T>(listingId: number, fn: () => Promise<T>): Promise<T>;

  appendAuditEvent(event: NewAuditEventInput): Promise<AuditEvent>;
  listAuditEvents(): Promise<AuditEvent[]>;

  userRolesInclude(user: PublicUser, role: UserRole): boolean;
}
