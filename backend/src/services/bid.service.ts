import type { Request } from 'express';
import type { AutoBidSetting, AutoBidWithListing, Bid, BidWithListing, Listing } from '../types/domain';
import { addBid, deactivateAutoBid, getAutoBidForBidder, getBidsByBidder, getBidsForListing, getListingById, listActiveAutoBidsForListing, listAutoBidsByBidder, updateListing, upsertAutoBid, withListingLock } from '../repositories';
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

  const now = Date.now();
  if (new Date(listing.start_time).getTime() > now) {
    // Approved future auctions are visible to the donor as UPCOMING, but cannot receive bids
    // or be surfaced publicly until their start time arrives.
    throw badRequest('Auction has not started yet.', 'AUCTION_NOT_STARTED');
  }
  if (new Date(listing.end_time).getTime() <= now) {
    await closeExpiredAuctions();
    throw badRequest('Auction has ended.');
  }
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
  autoIncrement: number;
  updatedAt: number;
}

const compareAutoBidPriority = (a: AutoBidCandidate, b: AutoBidCandidate): number => {
  // Higher private maximum wins. If the maximums match, the earlier setting
  // keeps priority, so bidders cannot probe another user's maximum by trying
  // the same value later.
  if (b.maxAmount !== a.maxAmount) return b.maxAmount - a.maxAmount;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
  return a.bidderId - b.bidderId;
};

const canTakeTiePriority = (
  candidate: AutoBidCandidate,
  currentBid: number,
  currentWinner: AutoBidCandidate | undefined,
): boolean => {
  if (candidate.maxAmount !== currentBid) return false;

  // If the current public winner has no auto-bid setting, they are normally the
  // manual bidder who just matched an existing auto-bid maximum. In that case,
  // the existing auto-bidder keeps the tie priority at the same amount.
  if (!currentWinner) return true;

  return compareAutoBidPriority(candidate, currentWinner) < 0;
};

// Resolve automatic bidding until the auction reaches a stable winner.
//
// This mirrors proxy-style bidding while still respecting the donor-defined
// listing minimum increment for every public bid:
// - a bidder's maximum remains private;
// - same maximums are allowed so bidders cannot probe another user's setting;
// - the highest maximum wins;
// - if maximums match, the earlier auto-bid keeps priority;
// - every auto-response must either meet the next legal public bid
//   (current bid + listing minimum increment), or perform a same-price
//   tie-priority handover for an earlier auto-bidder whose max was matched.
//
// Example with current bid 110, listing min increment 10, and two bidders both
// having max=200/increment=25:
// B enters at 120 → A responds 145 → B responds 170 → A responds 195.
// B cannot respond with 200 because the next legal bid after 195 is 205,
// which exceeds B's private maximum. A therefore wins at 195 without exposing
// the exact 200 maximum.
const resolveAutoBids = async (listing: Listing): Promise<Bid[]> => {
  const autoBids = await listActiveAutoBidsForListing(listing.id);
  const candidates: AutoBidCandidate[] = autoBids.map(autoBid => ({
    bidderId: autoBid.bidder_id,
    bidderUsername: autoBid.bidder_username,
    maxAmount: roundMoney(autoBid.max_amount),
    // Use at least the listing minimum so old rows created before this FR12
    // bug fix cannot place an automatic response that undercuts the auction rule.
    autoIncrement: roundMoney(Math.max(autoBid.auto_increment, listing.min_increment)),
    updatedAt: new Date(autoBid.updated_at).getTime(),
  }));

  const responses: Bid[] = [];

  // Safety guard against accidental non-progress caused by future code changes.
  // In normal operation the loop finishes naturally because every response either
  // raises the public amount or performs one final same-price tie-priority handover.
  for (let guard = 0; guard < 10_000; guard += 1) {
    const currentBid = roundMoney(listing.current_bid);
    const currentWinner = candidates.find(candidate => candidate.bidderId === listing.winner_id);

    const nextLegalBid = roundMoney(currentBid + listing.min_increment);

    const nextCandidate = [...candidates]
      .filter(candidate => candidate.bidderId !== listing.winner_id)
      // A normal auto-response must still be a legal public bid. For example,
      // when the current bid is 195 and the listing minimum increment is 10,
      // a bidder capped at 200 cannot respond because the next legal bid is 205.
      // The tie-priority exception is only for an earlier auto-bidder whose
      // private maximum has just been matched by the current public bid.
      .filter(candidate => candidate.maxAmount >= nextLegalBid || canTakeTiePriority(candidate, currentBid, currentWinner))
      .sort(compareAutoBidPriority)[0];

    if (!nextCandidate) return responses;

    const isTiePriorityMove = canTakeTiePriority(nextCandidate, currentBid, currentWinner);
    const targetAmount = isTiePriorityMove
      ? currentBid
      : roundMoney(Math.min(nextCandidate.maxAmount, currentBid + nextCandidate.autoIncrement));

    if (targetAmount < currentBid) return responses;
    if (!isTiePriorityMove && targetAmount < nextLegalBid) return responses;
    if (targetAmount === currentBid && !isTiePriorityMove) return responses;

    const bid = await recordBid(listing, {
      listing_id: listing.id,
      bidder_id: nextCandidate.bidderId,
      bidder_username: nextCandidate.bidderUsername,
      amount: targetAmount,
      is_auto_bid: true,
    });

    responses.push(bid);
  }

  // Returning partial responses is safer than throwing after bids were already
  // recorded. The guard should never be reached unless a future change breaks
  // the progress rules above.
  return responses;
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

export const setAutoBid = async (listingIdInput: number, maxAmountInput: number, autoIncrementInput: unknown, req: Request): Promise<{ autoBid: AutoBidSetting; result: BidPlacementResult }> => {
  const user = assertBidder(req);
  const listingId = Number(listingIdInput);
  const maxAmount = roundMoney(Number(maxAmountInput));

  if (!Number.isInteger(listingId) || listingId <= 0 || !Number.isFinite(maxAmount)) throw badRequest('Invalid auto-bid request.');
  checkBidVelocity(user.id, listingId);

  return withListingLock(listingId, async () => {
    const listing = await assertActiveBiddableListing(listingId, user.id);
    const minimum = nextMinimumBid(listing);
    const userIsWinning = listing.winner_id === user.id;
    // Existing clients that do not yet send auto_increment continue to work by
    // defaulting to the listing's donor-defined minimum bid increment.
    const autoIncrement = roundMoney(Number(autoIncrementInput ?? listing.min_increment));

    if (!Number.isFinite(autoIncrement) || autoIncrement < listing.min_increment) {
      throw badRequest(`Auto-bid increment must be at least ${listing.min_increment.toFixed(2)}.`, 'AUTO_BID_INCREMENT_TOO_LOW');
    }
    if (autoIncrement > maxAmount) {
      throw badRequest('Auto-bid increment cannot be higher than your maximum auto-bid amount.', 'AUTO_BID_INCREMENT_TOO_HIGH');
    }

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
      auto_increment: autoIncrement,
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
      { listingId, autoBidId: autoBid.uuid, maxAmount: '[MASKED]', autoIncrement, generatedPublicBids: acceptedBids.length },
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