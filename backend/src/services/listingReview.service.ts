import type { Request } from 'express';
import type { CharityOrganisation, Listing } from '../types/domain';
import {
  getCampaignById,
  getCharityById,
  getCharityByOwnerUserId,
  getListingByUuid,
  listCampaignsByCharity,
  listCharityReviewQueue,
  updateListing,
} from '../repositories';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { safeString, containsScriptLikeContent, sanitizeText } from '../utils/security';
import { audit } from './audit.service';

type ListingReviewDecision = 'approved' | 'rejected';

export interface CharityListingReviewResponse {
  canReviewListings: boolean;
  charity?: Pick<CharityOrganisation, 'id' | 'uuid' | 'organisationName' | 'status'>;
  listings: Listing[];
}

const resolveReviewingCharity = async (req: Request): Promise<CharityOrganisation> => {
  if (!req.user) throw forbidden('Authentication required');

  const { id, roles, charityId } = req.user;
  let charity: CharityOrganisation | undefined;

  if (roles.includes('charity')) {
    charity = await getCharityByOwnerUserId(id);
  } else if (roles.includes('charity_staff') && charityId) {
    charity = await getCharityById(charityId);
  }

  if (!charity) {
    throw forbidden('No charity organisation is linked to this account.', 'CHARITY_NOT_LINKED');
  }

  if (charity.status !== 'approved') {
    throw forbidden('Your charity organisation must be approved before reviewing assigned listings.', 'CHARITY_NOT_APPROVED');
  }

  return charity;
};

const listingBelongsToCharity = async (listing: Listing, charityId: number): Promise<boolean> => {
  const campaign = await getCampaignById(listing.campaign_id);
  return campaign?.charity_id === charityId;
};

export const listListingsForCharityReview = async (req: Request): Promise<CharityListingReviewResponse> => {
  const charity = await resolveReviewingCharity(req);
  const campaigns = await listCampaignsByCharity(charity.id);
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  // SFR09 stage 2: the charity only sees listings the admin has approved and forwarded
  // (status 'charity_review'), never raw 'pending' submissions still awaiting admin review.
  const forwardedListings = await listCharityReviewQueue();

  // Only return listings assigned to campaigns owned by this charity.
  // This prevents forceful browsing or accidental cross-charity review access.
  const listings = forwardedListings.filter((listing) => campaignIds.has(listing.campaign_id));

  await audit(
    req,
    'CHARITY_LISTING_REVIEW_QUEUE_VIEWED',
    { listingCount: listings.length, campaignCount: campaignIds.size },
    'charity',
    charity.uuid,
    req.user!.id,
  );

  return {
    canReviewListings: true,
    charity: {
      id: charity.id,
      uuid: charity.uuid,
      organisationName: charity.organisationName,
      status: charity.status,
    },
    listings,
  };
};

export const reviewAssignedListing = async (
  uuid: string,
  decisionInput: unknown,
  reasonInput: unknown,
  req: Request,
): Promise<Listing> => {
  const charity = await resolveReviewingCharity(req);
  const decision = safeString(decisionInput, 20) as ListingReviewDecision;
  if (!['approved', 'rejected'].includes(decision)) throw badRequest('Decision must be approved or rejected.');

  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found.');

  const belongsToCharity = await listingBelongsToCharity(listing, charity.id);
  if (!belongsToCharity) {
    await audit(req, 'CHARITY_LISTING_REVIEW_DENIED', { listingUuid: uuid }, 'listing', uuid, req.user?.id);
    throw forbidden('This listing is not assigned to your charity campaign.', 'LISTING_NOT_ASSIGNED_TO_CHARITY');
  }

  if (listing.status !== 'charity_review') {
    throw badRequest('Only listings forwarded by an administrator can be reviewed by the assigned charity.', 'LISTING_NOT_PENDING_REVIEW');
  }

  const reasonText = safeString(reasonInput, 300);
  if (containsScriptLikeContent(reasonText)) {
    throw badRequest('Please remove script-like content from the reason.', 'UNSAFE_TEXT_CONTENT', { reason: 'Please remove script-like content.' });
  }
  const reason = sanitizeText(reasonText, 300);
  if (decision === 'rejected' && reason.length < 5) {
    throw badRequest('A rejection reason of at least 5 characters is required.', 'VALIDATION_ERROR', {
      reason: 'Please explain why this listing was rejected.',
    });
  }

  listing.status = decision === 'approved' ? 'active' : 'rejected';
  if (decision === 'approved') {
    // Charity approval completes the two-stage FR09 workflow. Future-dated auctions must stay
    // future-dated so FR10 can show them as UPCOMING. If the original hidden review window has
    // already elapsed, re-anchor to now and preserve the donor's intended duration to avoid a
    // dead listing that is approved but immediately expired.
    const originalStartMs = new Date(listing.start_time).getTime();
    const originalEndMs = new Date(listing.end_time).getTime();
    const originalDurationMs = Math.max(originalEndMs - originalStartMs, 60 * 60 * 1000);
    const now = Date.now();

    if (originalEndMs <= now || originalStartMs <= now) {
      listing.start_time = new Date(now).toISOString();
      listing.end_time = new Date(now + originalDurationMs).toISOString();
    }

    listing.review_note = undefined;
    listing.review_stage = undefined;
  } else {
    listing.review_note = reason;
    listing.review_stage = 'charity';
  }

  await updateListing(listing);
  await audit(
    req,
    decision === 'approved' ? 'CHARITY_LISTING_APPROVED' : 'CHARITY_LISTING_REJECTED',
    { listingUuid: uuid, decision, reason: decision === 'rejected' ? reason : undefined, charityId: charity.id },
    'listing',
    listing.uuid,
    req.user!.id,
  );

  return listing;
};