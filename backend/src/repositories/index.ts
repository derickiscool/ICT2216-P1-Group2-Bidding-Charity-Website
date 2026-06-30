import { inMemoryRepository } from './inMemory.repository';
import { postgresRepository } from './postgres.repository';
import type { BidForGoodRepository } from './repository.types';

const selectRepository = (): BidForGoodRepository => {
  const dataStore = (process.env.DATA_STORE ?? 'memory').trim().toLowerCase();
  if (dataStore === 'memory') return inMemoryRepository;
  if (dataStore === 'postgres') return postgresRepository;
  throw new Error(`Unsupported DATA_STORE value: ${dataStore}`);
};

export const repository = selectRepository();

export const {
  findUserByEmail,
  findUserById,
  findUserByUuid,
  findUserByUsername,
  addUser,
  updateUser,
  toPublicUser,
  savePendingRegistration,
  getPendingRegistration,
  removePendingRegistration,
  addSession,
  getSession,
  updateSession,
  revokeSession,
  addCharity,
  getCharityByUuid,
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
} = repository;

export type {
  BidForGoodRepository,
  NewAuditEventInput,
  NewBidInput,
  NewCharityInput,
  NewListingInput,
  NewUserInput,
  PublicUser,
} from './repository.types';
