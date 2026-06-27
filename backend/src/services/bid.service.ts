import type { Request } from 'express';
import type { Bid } from '../types/domain';
import { addBid, getBidsForListing, getListingById, updateListing } from '../repositories/inMemory.repository';
import { badRequest, forbidden, notFound, tooManyRequests } from '../utils/errors';
import { roundMoney } from '../utils/security';
import { audit } from './audit.service';

const locks = new Map<number, Promise<void>>();
const bidderVelocity = new Map<string, number[]>();

const withListingLock = async <T>(listingId: number, fn: () => Promise<T>): Promise<T> => {
  const previous = locks.get(listingId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const chained = previous.then(() => current);
  locks.set(listingId, chained);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(listingId) === chained) locks.delete(listingId);
  }
};

const checkBidVelocity = (userId: number, listingId: number): void => {
  const key = `${userId}:${listingId}`;
  const now = Date.now();
  const recent = (bidderVelocity.get(key) ?? []).filter(ts => now - ts < 60_000);
  if (recent.length >= 10) throw tooManyRequests('Bid rate limit exceeded. Please wait before bidding again.', 'BID_FLOOD_REJECTED');
  recent.push(now);
  bidderVelocity.set(key, recent);
};

export const placeBid = async (listingIdInput: number, amountInput: number, req: Request): Promise<Bid> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('bidder')) throw forbidden('Only bidder accounts may place bids.');
  const listingId = Number(listingIdInput);
  const amount = roundMoney(Number(amountInput));
  if (!Number.isInteger(listingId) || listingId <= 0 || !Number.isFinite(amount)) throw badRequest('Invalid bid request.');
  checkBidVelocity(req.user.id, listingId);
  return withListingLock(listingId, async () => {
    const listing = await getListingById(listingId);
    if (!listing || listing.status !== 'active') throw notFound('Active listing not found');
    if (new Date(listing.end_time).getTime() <= Date.now()) throw badRequest('Auction has ended.');
    if (listing.donor_id === req.user?.id) throw forbidden('Donors cannot bid on their own listings.');
    const minimum = roundMoney(Math.max(listing.starting_price, listing.current_bid) + listing.min_increment);
    if (amount < minimum) {
      await audit(req, 'BID_REJECTED_MIN_INCREMENT', { listingId, amount, minimum }, 'listing', listing.uuid, req.user?.id);
      throw badRequest(`Bid must be at least ${minimum.toFixed(2)}.`, 'BID_TOO_LOW');
    }
    const bid = await addBid({ listing_id: listing.id, bidder_id: req.user!.id, bidder_username: req.user!.username, amount, is_auto_bid: false });
    listing.current_bid = amount;
    listing.bid_count += 1;
    listing.winner_id = req.user!.id;
    await updateListing(listing);
    await audit(req, 'BID_ACCEPTED', { listingId, amount, previousPrice: minimum - listing.min_increment }, 'bid', bid.uuid, req.user!.id);
    return bid;
  });
};

export const listBidsForListing = async (listingId: number): Promise<Bid[]> => getBidsForListing(Number(listingId));
