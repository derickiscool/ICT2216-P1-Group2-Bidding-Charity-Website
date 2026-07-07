import type { Request } from 'express';
import type { DonorListingTrackingDashboard, DonorListingTrackingItem, Listing, ListingStatus } from '../types/domain';
import { forbidden } from '../utils/errors';
import { audit } from './audit.service';
import { DONOR_DELETABLE_STATUSES, DONOR_EDITABLE_STATUSES, listMyListings } from './listing.service';
import { processAuctionDeadlines } from './payment.service';

const TRACKABLE_STATUSES: ListingStatus[] = ['draft', 'pending', 'active', 'sold', 'shipped', 'delivered', 'expired', 'cancelled', 'rejected'];

const emptyStatusSummary = (): DonorListingTrackingDashboard['summary'] => ({
  total: 0,
  draft: 0,
  pending: 0,
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

const buildTimelineLabel = (listing: Listing, nowMs: number): string => {
  const startMs = new Date(listing.start_time).getTime();
  const endMs = new Date(listing.end_time).getTime();

  if (listing.status === 'active' && Number.isFinite(startMs) && startMs > nowMs) {
    return `Starts in ${formatDuration(startMs - nowMs)}`;
  }

  if (listing.status === 'active' && Number.isFinite(endMs)) {
    return endMs > nowMs ? `Ends in ${formatDuration(endMs - nowMs)}` : 'Auction ended — closure processing pending';
  }

  if (listing.status === 'sold') return 'Auction closed with a winning bidder';
  if (listing.status === 'expired') return 'Auction ended without a valid winner';
  if (listing.status === 'pending') return 'Waiting for listing review';
  if (listing.status === 'draft') return 'Draft not yet submitted';
  if (listing.status === 'rejected') return 'Rejected during review';
  if (listing.status === 'cancelled') return 'Cancelled by donor or admin';

  return 'Status updated';
};

const statusCopy = (listing: Listing): Pick<DonorListingTrackingItem, 'statusLabel' | 'statusMessage'> => {
  switch (listing.status) {
    case 'draft':
      return {
        statusLabel: 'Draft',
        statusMessage: 'This listing is still a draft. Complete the details before submitting it for review.',
      };
    case 'pending':
      return {
        statusLabel: 'Pending Review',
        statusMessage: 'This listing is waiting for approval before it can appear on the campaign page.',
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
    case 'expired':
      return {
        statusLabel: 'Expired',
        statusMessage: 'The listing ended without a valid winning bidder or payment offer.',
      };
    case 'rejected':
      return {
        statusLabel: 'Rejected',
        statusMessage: 'The listing was rejected during review. You may edit it and resubmit if needed.',
      };
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
  const copy = statusCopy(listing);

  return {
    ...listing,
    ...copy,
    timelineLabel: buildTimelineLabel(listing, nowMs),
    canEdit: DONOR_EDITABLE_STATUSES.includes(listing.status),
    canDelete: DONOR_DELETABLE_STATUSES.includes(listing.status),
    finalBidAmount: listing.status === 'sold' ? listing.current_bid : undefined,
  };
};

const buildTrackingDashboard = (listings: Listing[]): DonorListingTrackingDashboard => {
  const now = new Date();
  const summary = emptyStatusSummary();
  const trackingItems = listings.map(listing => toTrackingItem(listing, now.getTime()));

  for (const item of trackingItems) {
    summary.total += 1;
    if (TRACKABLE_STATUSES.includes(item.status)) summary[item.status] += 1;
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