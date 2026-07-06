import type { Request } from 'express';
import type { Bid, BidWithListing } from '../types/domain';
import { addBid, getBidsByBidder, getBidsForListing, getListingById, updateListing, withListingLock } from '../repositories';
import { badRequest, forbidden, notFound, tooManyRequests } from '../utils/errors';
import { roundMoney } from '../utils/security';
import { audit } from './audit.service';
import { closeExpiredAuctions } from './payment.service';

const bidderVelocity = new Map<string, number[]>();

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
    if (new Date(listing.end_time).getTime() <= Date.now()) {
      await closeExpiredAuctions();
      throw badRequest('Auction has ended.');
    }
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

export const getBidderBids = async (bidderId: number): Promise<{ bids: BidWithListing[]; stats: BidderStats }> => {
  const bids = await getBidsByBidder(bidderId);
  const stats: BidderStats = {
    total: bids.length,
    totalSpent: bids.reduce((sum, b) => sum + b.amount, 0),
    uniqueListings: new Set(bids.map(b => b.listing_id)).size,
  };
  return { bids, stats };
};

export interface BidderStats {
  total: number;
  totalSpent: number;
  uniqueListings: number;
}
