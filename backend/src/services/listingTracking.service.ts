import type { Request } from 'express';
import type { DonorListingTrackingDashboard, DonorListingTrackingItem, Listing, ListingStatus } from '../types/domain';
import { forbidden } from '../utils/errors';
import { audit } from './audit.service';
import { DONOR_DELETABLE_STATUSES, DONOR_EDITABLE_STATUSES, listMyListings } from './listing.service';
import { processAuctionDeadlines } from './payment.service';

const TRACKABLE_STATUSES: ListingStatus[] = ['pending', 'changes_requested', 'charity_review', 'active', 'sold', 'shipped', 'delivered', 'expired', 'cancelled', 'rejected'];

type TrackingFilterStatus = DonorListingTrackingItem['trackingFilterStatus'];

const emptyStatusSummary = (): DonorListingTrackingDashboard['summary'] => ({
  total: 0,
  // Draft is kept in the API shape for backwards compatibility, but FR10 no longer displays it.
  draft: 0,
  pending: 0,
  changes_requested: 0,
  charity_review: 0,
  upcoming: 0,
  active: 0,
  sold: 0,
  shipped: 0,
  delivered: 0,
  expired: 0,
  cancelled: 0,
  rejected: 0,
});

const formatDuration = (milliseconds: number): string => {
  const safeMs = Math.max(0, milliseconds);
  const minutes = Math.floor(safeMs / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const isUpcoming = (listing: Listing, nowMs: number): boolean => {
  const startMs = new Date(listing.start_time).getTime();
  return listing.status === 'active' && Number.isFinite(startMs) && startMs > nowMs;
};

const getTrackingFilterStatus = (listing: Listing, nowMs: number): TrackingFilterStatus => {
  if (listing.status === 'pending' || listing.status === 'changes_requested' || listing.status === 'charity_review') return 'pending';
  if (isUpcoming(listing, nowMs)) return 'upcoming';
  if (listing.status === 'active') return 'active';
  if (listing.status === 'sold' || listing.status === 'shipped' || listing.status === 'delivered') return 'sold';
  if (listing.status === 'expired') return 'expired';
  return 'other';
};

const buildTimelineLabel = (listing: Listing, nowMs: number): string => {
  const startMs = new Date(listing.start_time).getTime();
  const endMs = new Date(listing.end_time).getTime();

  if (isUpcoming(listing, nowMs)) {
    return `Starts in ${formatDuration(startMs - nowMs)}`;
  }

  if (listing.status === 'active' && Number.isFinite(endMs)) {
    return endMs > nowMs ? `Ends in ${formatDuration(endMs - nowMs)}` : 'Auction ended — closure processing pending';
  }

  if (listing.status === 'sold') return 'Auction closed with a winning bidder';
  if (listing.status === 'shipped') return 'Item shipped — waiting for bidder confirmation';
  if (listing.status === 'delivered') return 'Item delivered and donation flow completed';
  if (listing.status === 'expired') return 'Auction ended without a valid winner';
  if (listing.status === 'pending') return 'Waiting for administrator review';
  if (listing.status === 'changes_requested') return 'Changes requested — update and resubmit';
  if (listing.status === 'charity_review') return 'Forwarded to the charity for review';
  if (listing.status === 'rejected') {
    return listing.review_stage === 'charity' ? 'Rejected by the charity'
      : listing.review_stage === 'admin' ? 'Rejected by an administrator'
      : 'Rejected during review';
  }
  if (listing.status === 'cancelled') return 'Cancelled by donor or admin';

  return 'Status updated';
};

const statusCopy = (listing: Listing, nowMs: number): Pick<DonorListingTrackingItem, 'statusLabel' | 'statusMessage'> => {
  if (isUpcoming(listing, nowMs)) {
    return {
      statusLabel: 'Upcoming',
      statusMessage: 'This listing has passed admin and charity review. It will only appear on public auction pages once the auction start time arrives.',
    };
  }

  switch (listing.status) {
    case 'draft':
      return {
        statusLabel: 'Hidden Draft',
        statusMessage: 'Draft listings are hidden from the FR10 tracking view. Submit the listing when it is ready for review.',
      };
    case 'pending':
      return {
        statusLabel: 'Pending Admin Review',
        statusMessage: 'This listing is waiting for administrator review before it is forwarded to the charity.',
      };
    case 'changes_requested':
      return {
        statusLabel: 'Changes Requested',
        statusMessage: listing.review_note
          ? `The administrator asked for changes: "${listing.review_note}". Edit the listing to resubmit it for review.`
          : 'The administrator asked for changes before this listing can proceed. Edit the listing to resubmit it for review.',
      };
    case 'charity_review':
      return {
        statusLabel: 'Charity Review',
        statusMessage: 'The administrator approved this listing and forwarded it to the charity for final review.',
      };
    case 'active':
      return {
        statusLabel: 'Active',
        statusMessage: 'This listing is published and can receive bids until the auction ends.',
      };
    case 'sold':
      return {
        statusLabel: 'Sold',
        statusMessage: 'The auction has ended with a winning bidder. Payment and fulfilment can now be tracked.',
      };
    case 'shipped':
      return {
        statusLabel: 'Shipped',
        statusMessage: 'Shipping details have been provided. The bidder can confirm delivery after receiving the item.',
      };
    case 'delivered':
      return {
        statusLabel: 'Delivered',
        statusMessage: 'The item was delivered and the donation receipt workflow has completed.',
      };
    case 'expired':
      return {
        statusLabel: 'Expired',
        statusMessage: 'The listing ended without a valid winning bidder or payment offer.',
      };
    case 'rejected': {
      // SFR09: attribute the rejection to the stage that made it, so the donor knows whether the
      // administrator (stage 1) or the charity (stage 2) turned the listing down.
      const rejectedBy =
        listing.review_stage === 'charity' ? 'the charity'
        : listing.review_stage === 'admin' ? 'an administrator'
        : 'a reviewer';
      return {
        statusLabel:
          listing.review_stage === 'charity' ? 'Rejected by Charity'
          : listing.review_stage === 'admin' ? 'Rejected by Admin'
          : 'Rejected',
        statusMessage: listing.review_note
          ? `This listing was rejected by ${rejectedBy}: "${listing.review_note}". This decision is final; to try again, submit a new listing.`
          : `This listing was rejected by ${rejectedBy}. This decision is final; to try again, submit a new listing.`,
      };
    }
    case 'cancelled':
      return {
        statusLabel: 'Cancelled',
        statusMessage: 'The listing was cancelled and is kept for audit traceability.',
      };
    default:
      return {
        statusLabel: 'Unknown',
        statusMessage: 'The listing status could not be recognised.',
      };
  }
};

const toTrackingItem = (listing: Listing, nowMs: number): DonorListingTrackingItem => {
  const trackingFilterStatus = getTrackingFilterStatus(listing, nowMs);
  const copy = statusCopy(listing, nowMs);

  return {
    ...listing,
    ...copy,
    trackingFilterStatus,
    timelineLabel: buildTimelineLabel(listing, nowMs),
    canEdit: DONOR_EDITABLE_STATUSES.includes(listing.status),
    canDelete: DONOR_DELETABLE_STATUSES.includes(listing.status),
    finalBidAmount: ['sold', 'shipped', 'delivered'].includes(listing.status) ? listing.current_bid : undefined,
  };
};

const buildTrackingDashboard = (listings: Listing[]): DonorListingTrackingDashboard => {
  const now = new Date();
  const summary = emptyStatusSummary();

  // FR10 change: draft records are no longer shown in the donor tracking dashboard.
  // They are filtered here so both the cards and the counts stay consistent.
  const visibleListings = listings.filter(listing => listing.status !== 'draft');
  const trackingItems = visibleListings.map(listing => toTrackingItem(listing, now.getTime()));

  for (const item of trackingItems) {
    summary.total += 1;
    if (TRACKABLE_STATUSES.includes(item.status)) summary[item.status] += 1;
    if (item.trackingFilterStatus === 'upcoming') {
      summary.upcoming += 1;
      summary.active -= 1;
    }
  }

  return {
    generatedAt: now.toISOString(),
    summary,
    listings: trackingItems,
  };
};

export const getMyListingTrackingDashboard = async (req: Request): Promise<DonorListingTrackingDashboard> => {
  if (!req.user) throw forbidden();

  // FR10 should display the latest lifecycle state instead of stale active auctions.
  // Reusing the FR14 processor keeps sold/expired transition rules in one place.
  await processAuctionDeadlines();

  const listings = await listMyListings(req);
  const dashboard = buildTrackingDashboard(listings);

  await audit(req, 'DONOR_LISTING_STATUS_VIEWED', { total: dashboard.summary.total, summary: dashboard.summary }, 'listing', 'mine', req.user.id);
  return dashboard;
};