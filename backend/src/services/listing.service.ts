import type { Request } from 'express';
import type { Listing, ListingStatus } from '../types/domain';
import { addListing, getListingByUuid, listActiveListings, listPendingListings, updateListing } from '../repositories/inMemory.repository';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { isSafeSearchQuery, roundMoney, sanitizeText } from '../utils/security';
import { audit } from './audit.service';

const LOCKED_FIELDS = new Set([
  'starting_price', 'startingPrice',
  'start_time', 'startTime',
  'end_time', 'endTime',
  'campaign_id', 'campaignId',
  'min_increment', 'minIncrement',
  'charityName', 'charity_name'
]);

export const createListing = async (body: Record<string, unknown>, req: Request): Promise<Listing> => {
  if (!req.user) throw forbidden();
  const starting = roundMoney(Number(body.starting_price ?? body.startingPrice));
  const minIncrement = roundMoney(Number(body.min_increment ?? body.minIncrement ?? 1));
  const durationHours = Number(body.durationHours ?? 24);
  if (!Number.isFinite(starting) || starting < 1) throw badRequest('Starting price must be at least 1.');
  if (!Number.isFinite(minIncrement) || minIncrement < 1) throw badRequest('Minimum bid increment must be at least 1.');
  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 720) throw badRequest('Auction duration must be 1 to 720 hours.');
  const title = sanitizeText(body.title, 120);
  const description = sanitizeText(body.description, 1200);
  const category = sanitizeText(body.category, 60);
  const charityName = sanitizeText(body.charityName ?? body.charity_name, 160);
  if (title.length < 3 || description.length < 10 || category.length < 2 || charityName.length < 2) throw badRequest('Listing title, description, category, and charity are required.');
  const status: ListingStatus = req.user.roles.includes('admin') ? 'active' : 'pending';
  const now = new Date();
  const listing = await addListing({
    donor_id: req.user.id,
    campaign_id: Number(body.campaign_id ?? 1),
    title,
    description,
    condition: (['new', 'like_new', 'good', 'fair'].includes(String(body.condition)) ? body.condition : 'good') as Listing['condition'],
    category,
    images: [],
    starting_price: starting,
    reserve_price: undefined,
    buy_now_price: undefined,
    status,
    start_time: now.toISOString(),
    end_time: new Date(now.getTime() + durationHours * 60 * 60 * 1000).toISOString(),
    charityName,
    min_increment: minIncrement
  });
  await audit(req, 'LISTING_CREATED', { title, status }, 'listing', listing.uuid, req.user.id);
  return listing;
};

export const updateListingDetails = async (uuid: string, body: Record<string, unknown>, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  if (!req.user?.roles.includes('admin') && listing.donor_id !== req.user?.id) throw forbidden('Access denied');
  if (listing.status === 'active') {
    const attemptedLocked = Object.keys(body).filter(key => LOCKED_FIELDS.has(key));
    if (attemptedLocked.length > 0) {
      await audit(req, 'LISTING_ACTIVE_LOCK_REJECTED', { attemptedLocked }, 'listing', listing.uuid, req.user?.id);
      throw forbidden('Auction configuration fields are locked once the auction is active.');
    }
  }
  if (body.title) listing.title = sanitizeText(body.title, 120);
  if (body.description) listing.description = sanitizeText(body.description, 1200);
  if (body.category) listing.category = sanitizeText(body.category, 60);
  await updateListing(listing);
  await audit(req, 'LISTING_UPDATED', { uuid }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

export const approveListing = async (uuid: string, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  if (listing.status !== 'pending') throw badRequest('Only pending listings can be approved.');
  listing.status = 'active';
  listing.start_time = new Date().toISOString();
  await updateListing(listing);
  await audit(req, 'LISTING_APPROVED', { uuid }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

export const searchPublicListings = async (query: Record<string, unknown>): Promise<Listing[]> => {
  const q = sanitizeText(query.q ?? query.search, 80);
  const category = sanitizeText(query.category, 60);
  if (q && !isSafeSearchQuery(q)) throw badRequest('Search query was rejected because it contained malformed or unsafe syntax.', 'UNSAFE_SEARCH_QUERY');
  if (category && !isSafeSearchQuery(category)) throw badRequest('Category filter was rejected because it contained malformed or unsafe syntax.', 'UNSAFE_SEARCH_QUERY');
  const active = await listActiveListings();
  return active.filter(l => {
    const matchesQ = !q || `${l.title} ${l.description} ${l.charityName}`.toLowerCase().includes(q.toLowerCase());
    const matchesCategory = !category || l.category.toLowerCase() === category.toLowerCase();
    return matchesQ && matchesCategory;
  });
};

export const getPublicListing = async (uuid: string): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing || listing.status !== 'active') throw notFound('Listing not found');
  return listing;
};

export const getPendingListings = async (): Promise<Listing[]> => listPendingListings();
