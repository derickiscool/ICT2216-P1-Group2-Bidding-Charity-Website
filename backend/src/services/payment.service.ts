import crypto from 'crypto';
import type { Request } from 'express';
import type { Bid, Listing, Payment, PaymentWithListing } from '../types/domain';
import {
  addPayment,
  getBidsForListing,
  getListingById,
  getListingByUuid,
  getPaymentByUuid,
  getPaymentsForListing,
  getPendingPaymentForListing,
  listActiveListings,
  listListings,
  listPaymentsByBidder,
  updateListing,
  updatePayment,
  withListingLock,
} from '../repositories';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { roundMoney } from '../utils/security';
import { audit } from './audit.service';

const DEFAULT_PAYMENT_DEADLINE_HOURS = 24;

const getPaymentDeadlineHours = (): number => {
  const raw = Number(process.env.PAYMENT_DEADLINE_HOURS ?? DEFAULT_PAYMENT_DEADLINE_HOURS);

  // Keep the deadline configurable, but bounded. A zero/negative value would make
  // every payment instantly overdue, while a huge value makes FR14 hard to test.
  if (!Number.isFinite(raw) || raw < 1 || raw > 168) return DEFAULT_PAYMENT_DEADLINE_HOURS;
  return raw;
};

const buildDeadline = (): string => {
  const ms = getPaymentDeadlineHours() * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
};

const buildPaymentRef = (listingId: number): string => {
  // The public UUID identifies the row. This short reference is useful for the UI/logs
  // and avoids exposing sequential database IDs as the only business reference.
  return `BFG-${listingId}-${crypto.randomUUID()}`;
};

const isDeadlineOver = (payment: Payment): boolean => new Date(payment.payment_deadline).getTime() <= Date.now();

const uniqueHighestBid = (bids: Bid[]): Bid | undefined => {
  const seen = new Set<number>();

  for (const bid of bids) {
    if (seen.has(bid.bidder_id)) continue;
    seen.add(bid.bidder_id);

    // Bids are returned highest amount first by the repository. Keeping only the
    // first bid per bidder prevents a single bidder's repeated bids from crowding
    // out other users while still selecting the highest valid winner.
    return bid;
  }

  return undefined;
};

const createPaymentOffer = async (
  listing: Listing,
  winningBid: Bid,
  req: Request | undefined,
  action: 'PAYMENT_OFFER_CREATED',
  extraPayload: Record<string, unknown> = {},
): Promise<Payment> => {
  const payment = await addPayment({
    listing_id: listing.id,
    bidder_id: winningBid.bidder_id,
    amount: roundMoney(winningBid.amount),
    payment_ref: buildPaymentRef(listing.id),
    escrow_state: 'not_held',
    status: 'pending',
    payment_deadline: buildDeadline(),
    offered_at: new Date().toISOString(),
  });

  // The listing stays as sold while payment is pending. The current winner_id points
  // to the original winning bidder only. Missed payment deadlines now expire the
  // auction instead of reassigning it, which avoids collusion-friendly fallback offers.
  listing.status = 'sold';
  listing.winner_id = winningBid.bidder_id;
  listing.current_bid = payment.amount;
  await updateListing(listing);

  await audit(
    req,
    action,
    {
      listingId: listing.id,
      bidderId: winningBid.bidder_id,
      amount: payment.amount,
      paymentDeadline: payment.payment_deadline,
      ...extraPayload,
    },
    'payment',
    payment.uuid,
    req?.user?.id,
  );

  return payment;
};

const expireListingWithoutWinner = async (
  listing: Listing,
  req: Request | undefined,
  action: 'AUCTION_EXPIRED_NO_BIDS' | 'AUCTION_EXPIRED_NO_VALID_BIDDERS' | 'AUCTION_EXPIRED_PAYMENT_DEADLINE_MISSED',
  payload: Record<string, unknown> = {},
): Promise<void> => {
  listing.status = 'expired';
  listing.winner_id = undefined;
  await updateListing(listing);

  await audit(req, action, { listingId: listing.id, ...payload }, 'listing', listing.uuid, req?.user?.id);
};

const closeEndedActiveListing = async (listingId: number, req?: Request, force = false): Promise<boolean> =>
  withListingLock(listingId, async () => {
    const listing = await getListingById(listingId);
    if (!listing || listing.status !== 'active') return false;
    if (!force && new Date(listing.end_time).getTime() > Date.now()) return false;

    // Idempotency guard: if another worker already created a payment offer, do not
    // create duplicates. Tiny guard, big headache saved. Future-you says thanks.
    const existingPending = await getPendingPaymentForListing(listing.id);
    if (existingPending) return false;

    const bids = await getBidsForListing(listing.id);
    const winningBid = uniqueHighestBid(bids);

    if (!winningBid) {
      await expireListingWithoutWinner(listing, req, 'AUCTION_EXPIRED_NO_BIDS');
      return true;
    }

    await createPaymentOffer(listing, winningBid, req, 'PAYMENT_OFFER_CREATED', { source: 'auction_closure' });
    return true;
  });

const expireOverduePaymentAndListing = async (payment: Payment, req?: Request): Promise<boolean> => {
  if (payment.status !== 'pending' || !isDeadlineOver(payment)) return false;

  const listing = await getListingById(payment.listing_id);
  if (!listing) return false;

  payment.status = 'expired';
  payment.escrow_state = 'not_held';
  await updatePayment(payment);

  await audit(
    req,
    'PAYMENT_DEADLINE_MISSED',
    {
      listingId: payment.listing_id,
      bidderId: payment.bidder_id,
      amount: payment.amount,
      paymentDeadline: payment.payment_deadline,
    },
    'payment',
    payment.uuid,
    req?.user?.id,
  );

  // FR14 change: do not offer the item to the next highest bidder after a missed
  // payment. Reassignment can be abused by colluding bidders: one account can bid
  // very high, intentionally miss the deadline, and let a second account receive
  // the item at a much lower price. Expiring the auction is simpler, safer, and
  // keeps the closing result accountable.
  await expireListingWithoutWinner(listing, req, 'AUCTION_EXPIRED_PAYMENT_DEADLINE_MISSED', {
    expiredPaymentUuid: payment.uuid,
    expiredBidderId: payment.bidder_id,
    expiredAmount: payment.amount,
  });

  return true;
};

const processOverduePaymentForListing = async (listingId: number, req?: Request): Promise<boolean> =>
  withListingLock(listingId, async () => {
    const pendingPayment = await getPendingPaymentForListing(listingId);
    if (!pendingPayment) return false;
    return expireOverduePaymentAndListing(pendingPayment, req);
  });

export const processAuctionDeadlines = async (req?: Request): Promise<{ processed: number }> => {
  let processed = 0;

  const activeListings = await listActiveListings();
  for (const listing of activeListings) {
    if (new Date(listing.end_time).getTime() <= Date.now()) {
      if (await closeEndedActiveListing(listing.id, req)) processed += 1;
    }
  }

  // Sold listings may still have pending payments. When one is overdue, expire
  // both the payment offer and auction instead of reassigning to the next bidder.
  const listings = await listListings();
  for (const listing of listings.filter(item => item.status === 'sold')) {
    if (await processOverduePaymentForListing(listing.id, req)) processed += 1;
  }

  return { processed };
};

export const listMyPayments = async (req: Request): Promise<PaymentWithListing[]> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('bidder')) throw forbidden('Only bidder accounts can view their payment offers.');

  return listPaymentsByBidder(req.user.id);
};

export const completePayment = async (paymentUuid: string, req: Request): Promise<Payment> => {
  if (!req.user) throw forbidden();
  if (!req.user.roles.includes('bidder')) throw forbidden('Only bidder accounts can complete payment.');

  const existing = await getPaymentByUuid(paymentUuid);
  if (!existing) throw notFound('Payment offer not found.');

  return withListingLock(existing.listing_id, async () => {
    const payment = await getPaymentByUuid(paymentUuid);
    if (!payment) throw notFound('Payment offer not found.');

    if (payment.bidder_id !== req.user?.id) {
      await audit(req, 'PAYMENT_ACCESS_DENIED', { paymentUuid }, 'payment', payment.uuid, req.user?.id);
      throw forbidden('This payment offer does not belong to your account.');
    }

    if (payment.status !== 'pending') throw badRequest('This payment offer is no longer pending.', 'PAYMENT_NOT_PENDING');

    if (isDeadlineOver(payment)) {
      await expireOverduePaymentAndListing(payment, req);
      throw badRequest('Payment deadline has passed. The auction has expired.', 'PAYMENT_DEADLINE_PASSED');
    }

    const listing = await getListingById(payment.listing_id);
    if (!listing || listing.status !== 'sold' || listing.winner_id !== payment.bidder_id) {
      throw badRequest('Payment offer is not linked to the current winning bidder.', 'PAYMENT_OFFER_NOT_CURRENT');
    }

    payment.status = 'successful';
    payment.escrow_state = 'held';
    payment.paid_at = new Date().toISOString();
    await updatePayment(payment);

    // Keep these fields server-owned. The client never sends amount, winner_id, or
    // listing status for completion; this prevents tampering with payment outcomes.
    listing.current_bid = payment.amount;
    listing.winner_id = payment.bidder_id;
    listing.status = 'sold';
    await updateListing(listing);

    // Generate receipt immediately when payment is completed — the bidder gets
    // their donation receipt right away instead of waiting for delivery confirmation.
    const { generateReceipt: genReceipt } = await import('./receipt.service');
    await genReceipt(payment, listing, req.user?.username ?? 'bidder');

    await audit(
      req,
      'PAYMENT_COMPLETED',
      { listingId: payment.listing_id, bidderId: payment.bidder_id, amount: payment.amount },
      'payment',
      payment.uuid,
      req.user.id,
    );

    return payment;
  });
};

export const releaseEscrowForListing = async (listingId: number, req: Request): Promise<void> => {
  const { getPaymentsForListing: getPayments, updatePayment: updPayment } = await import('../repositories');
  const payments = await getPayments(listingId);
  const heldPayment = payments.find(p => p.escrow_state === 'held');
  if (!heldPayment) return;

  heldPayment.escrow_state = 'released';
  heldPayment.escrow_release_hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      payment_id: heldPayment.id,
      listing_id: heldPayment.listing_id,
      bidder_id: heldPayment.bidder_id,
      amount: heldPayment.amount,
      payment_ref: heldPayment.payment_ref,
      released_at: new Date().toISOString(),
    }))
    .digest('hex');
  await updPayment(heldPayment);

  await audit(req, 'ESCROW_RELEASED', { listingId, amount: heldPayment.amount, escrowReleaseHash: heldPayment.escrow_release_hash }, 'payment', heldPayment.uuid, req.user?.id);
};

export const regenerateReceipt = async (paymentUuid: string, req: Request): Promise<{ message: string }> => {
  const { getPaymentByUuid: getPay } = await import('../repositories');
  const payment = await getPay(paymentUuid);
  if (!payment) throw notFound('Payment not found');
  if (payment.escrow_state !== 'released' && payment.escrow_state !== 'held') {
    throw badRequest('Only payments in held or released state can regenerate a receipt.', 'RECEIPT_REGENERATE_INVALID');
  }

  const { getListingById: getList } = await import('../repositories');
  const listing = await getList(payment.listing_id);
  if (!listing) throw notFound('Linked listing not found.');

  const { generateReceipt: genReceipt } = await import('./receipt.service');
  await genReceipt(payment, listing, req.user?.username ?? 'admin');

  await audit(req, 'RECEIPT_REGENERATED', { paymentUuid, listingId: payment.listing_id }, 'payment', payment.uuid, req.user?.id);
  return { message: 'Receipt regenerated successfully.' };
};

export const closeExpiredAuctions = async (forceUuid?: string): Promise<number> => {
  let processed = 0;

  // When forceUuid is provided, close that specific listing regardless of end_time.
  // Used by the admin force-close endpoint for testing the full flow instantly.
  if (forceUuid) {
    const listing = await getListingByUuid(forceUuid);
    if (!listing || listing.status !== 'active') throw notFound('Active listing not found.');
    if (await closeEndedActiveListing(listing.id, undefined, true)) processed += 1;
  } else {
    const active = await listActiveListings();
    for (const listing of active) {
      if (new Date(listing.end_time).getTime() <= Date.now()) {
        if (await closeEndedActiveListing(listing.id)) processed += 1;
      }
    }
  }

  return processed;
};
