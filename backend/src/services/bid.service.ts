import type { Request } from 'express';
import type { AutoBidSetting, AutoBidWithListing, Bid, BidWithListing, Listing } from '../types/domain';
import { addBid, deactivateAutoBid, getAutoBidForBidder, getBidsByBidder, getBidsForListing, getListingById, listActiveAutoBidsForListing, listAutoBidsByBidder, updateListing, upsertAutoBid, withListingLock } from '../repositories';
import { badRequest, forbidden, notFound, tooManyRequests } from '../utils/errors';
import { roundMoney } from '../utils/security';
import { audit } from './audit.service';

const bidderVelocity = new Map<string, number[]>();

const checkBidVelocity = (userId: number, listingId: number): void => {
  const key = `${userId}:${listingId}`;
  const now = Date.now();
  const recent = (bidderVelocity.get(key) ?? []).filter(ts => now - ts < 60_000);
  if (recent.length >= 10) throw tooManyRequests('Bid rate limit exceeded. Please wait before bidding again.', 'BID_FLOOD_REJECTED');
  recent.push(now);
  bidderVelocity.set(key, recent);
};

const nextMinimumBid = (listing: Listing): number =>
  roundMoney(Math.max(listing.starting_price, listing.current_bid) + listing.min_increment);

const assertBidder = (req: Request): NonNullable<Request['user']> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('bidder')) throw forbidden('Only bidder accounts may bid on listings.');
  return req.user;
};

const assertActiveBiddableListing = async (listingId: number, bidderId: number): Promise<Listing> => {
  if (!Number.isInteger(listingId) || listingId <= 0) throw badRequest('Invalid bid request.');

  const listing = await getListingById(listingId);
  if (!listing || listing.status !== 'active') throw notFound('Active listing not found');
  if (new Date(listing.end_time).getTime() <= Date.now()) throw badRequest('Auction has ended.');
  if (listing.donor_id === bidderId) throw forbidden('Donors cannot bid on their own listings.');

  return listing;
};

const recordBid = async (listing: Listing, bid: Omit<Bid, 'id' | 'uuid' | 'created_at'>): Promise<Bid> => {
  const acceptedBid = await addBid(bid);
  listing.current_bid = bid.amount;
  listing.bid_count += 1;
  listing.winner_id = bid.bidder_id;
  await updateListing(listing);
  return acceptedBid;
};

interface AutoBidCandidate {
  bidderId: number;
  bidderUsername: string;
  maxAmount: number;
  updatedAt: number;
  source: 'auto' | 'public';
}

// Calculates the public bid needed to keep the highest auto-bidder in front.
// The private max_amount is used only inside the backend and is never returned
// through the public listing/bid-history APIs, which keeps FR12 fair.
const resolveAutoBids = async (listing: Listing): Promise<Bid[]> => {
  const autoBids = await listActiveAutoBidsForListing(listing.id);
  const candidates = new Map<number, AutoBidCandidate>();

  for (const autoBid of autoBids) {
    candidates.set(autoBid.bidder_id, {
      bidderId: autoBid.bidder_id,
      bidderUsername: autoBid.bidder_username,
      maxAmount: roundMoney(autoBid.max_amount),
      updatedAt: new Date(autoBid.updated_at).getTime(),
      source: 'auto',
    });
  }

  if (listing.winner_id) {
    const existing = candidates.get(listing.winner_id);
    const publicCandidate: AutoBidCandidate = {
      bidderId: listing.winner_id,
      bidderUsername: existing?.bidderUsername ?? 'bidder',
      maxAmount: roundMoney(Math.max(existing?.maxAmount ?? 0, listing.current_bid)),
      // Existing auto-bids keep priority on exact ties; the current public bid is
      // treated as the latest candidate.
      updatedAt: existing?.updatedAt ?? Date.now(),
      source: existing?.source ?? 'public',
    };
    candidates.set(listing.winner_id, publicCandidate);
  }

  const ranked = [...candidates.values()].sort((a, b) => {
    if (b.maxAmount !== a.maxAmount) return b.maxAmount - a.maxAmount;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
    return a.bidderId - b.bidderId;
  });

  const winner = ranked[0];
  if (!winner) return [];

  const second = ranked.find(candidate => candidate.bidderId !== winner.bidderId);
  const targetAmount = roundMoney(
    second
      ? Math.max(listing.current_bid, Math.min(winner.maxAmount, second.maxAmount + listing.min_increment))
      : listing.current_bid,
  );

  const shouldInsertAutoBid =
    winner.source === 'auto' &&
    (winner.bidderId !== listing.winner_id || targetAmount > listing.current_bid);

  if (!shouldInsertAutoBid) return [];

  const bid = await recordBid(listing, {
    listing_id: listing.id,
    bidder_id: winner.bidderId,
    bidder_username: winner.bidderUsername,
    amount: targetAmount,
    is_auto_bid: true,
  });

  return [bid];
};

export interface BidPlacementResult {
  bids: Bid[];
  currentBid: number;
  winnerId?: number;
}

export const placeBid = async (listingIdInput: number, amountInput: number, req: Request): Promise<BidPlacementResult> => {
  const user = assertBidder(req);
  const listingId = Number(listingIdInput);
  const amount = roundMoney(Number(amountInput));

  if (!Number.isInteger(listingId) || listingId <= 0 || !Number.isFinite(amount)) throw badRequest('Invalid bid request.');
  checkBidVelocity(user.id, listingId);

  return withListingLock(listingId, async () => {
    const listing = await assertActiveBiddableListing(listingId, user.id);
    const minimum = nextMinimumBid(listing);

    if (amount < minimum) {
      await audit(req, 'BID_REJECTED_MIN_INCREMENT', { listingId, amount, minimum }, 'listing', listing.uuid, user.id);
      throw badRequest(`Bid must be at least ${minimum.toFixed(2)}.`, 'BID_TOO_LOW');
    }

    const manualBid = await recordBid(listing, {
      listing_id: listing.id,
      bidder_id: user.id,
      bidder_username: user.username,
      amount,
      is_auto_bid: false,
    });

    const autoBids = await resolveAutoBids(listing);
    await audit(req, 'BID_ACCEPTED', { listingId, amount, autoResponses: autoBids.length }, 'bid', manualBid.uuid, user.id);

    return {
      bids: [manualBid, ...autoBids],
      currentBid: listing.current_bid,
      winnerId: listing.winner_id,
    };
  });
};

export const setAutoBid = async (listingIdInput: number, maxAmountInput: number, req: Request): Promise<{ autoBid: AutoBidSetting; result: BidPlacementResult }> => {
  const user = assertBidder(req);
  const listingId = Number(listingIdInput);
  const maxAmount = roundMoney(Number(maxAmountInput));

  if (!Number.isInteger(listingId) || listingId <= 0 || !Number.isFinite(maxAmount)) throw badRequest('Invalid auto-bid request.');
  checkBidVelocity(user.id, listingId);

  return withListingLock(listingId, async () => {
    const listing = await assertActiveBiddableListing(listingId, user.id);
    const minimum = nextMinimumBid(listing);
    const userIsWinning = listing.winner_id === user.id;

    if (!userIsWinning && maxAmount < minimum) {
      throw badRequest(`Maximum auto-bid must be at least ${minimum.toFixed(2)}.`, 'AUTO_BID_TOO_LOW');
    }
    if (userIsWinning && maxAmount < listing.current_bid) {
      throw badRequest('Maximum auto-bid cannot be lower than your current winning bid.', 'AUTO_BID_TOO_LOW');
    }

    const autoBid = await upsertAutoBid({
      listing_id: listing.id,
      bidder_id: user.id,
      bidder_username: user.username,
      max_amount: maxAmount,
      is_active: true,
    });

    const acceptedBids: Bid[] = [];
    if (!userIsWinning) {
      const openingAmount = roundMoney(Math.min(maxAmount, minimum));
      const openingAutoBid = await recordBid(listing, {
        listing_id: listing.id,
        bidder_id: user.id,
        bidder_username: user.username,
        amount: openingAmount,
        is_auto_bid: true,
      });
      acceptedBids.push(openingAutoBid);
    }

    acceptedBids.push(...await resolveAutoBids(listing));

    await audit(
      req,
      'AUTO_BID_SET',
      { listingId, autoBidId: autoBid.uuid, maxAmount: '[MASKED]', generatedPublicBids: acceptedBids.length },
      'listing',
      listing.uuid,
      user.id,
    );

    return {
      autoBid,
      result: {
        bids: acceptedBids,
        currentBid: listing.current_bid,
        winnerId: listing.winner_id,
      },
    };
  });
};

export const cancelAutoBid = async (listingIdInput: number, req: Request): Promise<AutoBidSetting> => {
  const user = assertBidder(req);
  const listingId = Number(listingIdInput);
  if (!Number.isInteger(listingId) || listingId <= 0) throw badRequest('Invalid auto-bid request.');

  const autoBid = await deactivateAutoBid(listingId, user.id);
  if (!autoBid) throw notFound('Auto-bid setting not found.');
  await audit(req, 'AUTO_BID_CANCELLED', { listingId, autoBidId: autoBid.uuid }, 'listing', String(listingId), user.id);
  return autoBid;
};

export const getMyAutoBidForListing = async (listingIdInput: number, req: Request): Promise<AutoBidSetting | undefined> => {
  const user = assertBidder(req);
  const listingId = Number(listingIdInput);
  if (!Number.isInteger(listingId) || listingId <= 0) throw badRequest('Invalid auto-bid request.');
  return getAutoBidForBidder(listingId, user.id);
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

export const getBidderAutoBids = async (bidderId: number): Promise<AutoBidWithListing[]> => listAutoBidsByBidder(bidderId);

export interface BidderStats {
  total: number;
  totalSpent: number;
  uniqueListings: number;
}