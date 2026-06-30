import { postgresRepository } from './postgres.repository';

export const repository = postgresRepository;

export const {
  findUserByEmail,
  findUserById,
  findUserByUuid,
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
