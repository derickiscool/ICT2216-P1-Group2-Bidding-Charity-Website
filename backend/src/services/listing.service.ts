import type { Request } from 'express';
import type { Delivery, Listing, ListingStatus } from '../types/domain';
import { addDelivery, addListing, getCampaignById, getCharityById, getDeliveryByListingId, getListingByUuid, getPaymentsForListing, listActiveListings, listListings, listListingsByDonor, listListingsByStatus, listPendingListings, updateDelivery, updateListing } from '../repositories';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { containsScriptLikeContent, isSafeSearchQuery, roundMoney, sanitizeText, safeString } from '../utils/security';
import { audit } from './audit.service';
import { releaseEscrowForListing } from './payment.service';
import { MAX_LISTING_IMAGES, MAX_LISTING_IMAGE_BYTES } from '../middleware/upload.middleware';

const LOCKED_FIELDS = new Set([
  'starting_price', 'startingPrice',
  'start_time', 'startTime',
  'end_time', 'endTime',
  'campaign_id', 'campaignId',
  'min_increment', 'minIncrement',
  'charityName', 'charity_name'
]);

// `draft` is no longer part of the donor-facing FR10 flow. New submissions go straight to
// `pending`, and legacy drafts are hidden from the tracking dashboard.
// `charity_review` is intentionally NOT editable — the listing is locked while the charity reviews it.
// `rejected` is editable for the donor-facing resubmission path: once the donor updates the
// listing, it is moved back to `pending` for the admin → charity review workflow again.
export const DONOR_EDITABLE_STATUSES: ListingStatus[] = ['pending', 'changes_requested', 'rejected'];
export const DONOR_DELETABLE_STATUSES: ListingStatus[] = ['pending', 'changes_requested', 'rejected', 'expired', 'cancelled'];
const SAFE_IMAGE_URL = /^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|\/api\/[^\s<>"']+|https?:\/\/[^\s<>"']+)$/i;

// SFR07: reject (not just escape) title/description text containing script-like content,
// so the rule holds even for requests that bypass the frontend form entirely.
const sanitizeListingText = (raw: unknown, maxLength: number, field: string): string => {
  const text = safeString(raw, maxLength);
  if (containsScriptLikeContent(text)) {
    throw badRequest(`Please remove script-like content from the listing ${field}.`, 'UNSAFE_TEXT_CONTENT', { [field]: 'Please remove script-like content.' });
  }
  return sanitizeText(text, maxLength);
};

type UploadedListingImage = Express.Multer.File;

const getUploadedFiles = (req: Request): UploadedListingImage[] => {
  if (!Array.isArray(req.files)) return [];
  return req.files as UploadedListingImage[];
};

const hasJpegSignature = (buffer: Buffer): boolean => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

const hasPngSignature = (buffer: Buffer): boolean => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const hasWebpSignature = (buffer: Buffer): boolean => buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';

const hasValidImageSignature = (file: UploadedListingImage): boolean => {
  if (file.mimetype === 'image/jpeg') return hasJpegSignature(file.buffer);
  if (file.mimetype === 'image/png') return hasPngSignature(file.buffer);
  if (file.mimetype === 'image/webp') return hasWebpSignature(file.buffer);
  return false;
};

const imagesFromUploads = (req: Request): string[] => {
  const files = getUploadedFiles(req);
  if (files.length > MAX_LISTING_IMAGES) throw badRequest(`A maximum of ${MAX_LISTING_IMAGES} listing images is allowed.`);

  return files.map(file => {
    if (file.size > MAX_LISTING_IMAGE_BYTES) throw badRequest('Each listing image must be 2MB or smaller.', 'LISTING_IMAGE_TOO_LARGE');
    if (!hasValidImageSignature(file)) throw badRequest('Uploaded listing image failed file signature validation.', 'INVALID_LISTING_IMAGE_SIGNATURE');

    // Current schema stores listing images as TEXT[]. For this project feature,
    // uploaded images are saved as data URLs instead of adding a separate file storage service.
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  });
};

// Existing images are resent as base64 data URLs (up to MAX_LISTING_IMAGE_BYTES of binary,
// which base64 inflates by ~4/3). These caps must fit a full-size image, or a real photo
// gets truncated mid-string here, fails the SAFE_IMAGE_URL/currentImages check in
// buildUpdatedImages, and is silently dropped even though the donor never touched it.
const MAX_IMAGE_DATA_URL_CHARS = Math.ceil(MAX_LISTING_IMAGE_BYTES * 1.4);
const MAX_EXISTING_IMAGES_JSON_CHARS = MAX_IMAGE_DATA_URL_CHARS * MAX_LISTING_IMAGES + 1024;

const parseExistingImageInput = (raw: unknown): string[] | undefined => {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.map(value => safeString(value, MAX_IMAGE_DATA_URL_CHARS)).filter(Boolean);

  const text = safeString(raw, MAX_EXISTING_IMAGES_JSON_CHARS);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(value => safeString(value, MAX_IMAGE_DATA_URL_CHARS)).filter(Boolean);
  } catch {
    // Fallback: allow a single existing image string if the client does not send JSON.
  }

  return [text];
};

const buildUpdatedImages = (listing: Listing, body: Record<string, unknown>, req: Request): string[] => {
  const uploaded = imagesFromUploads(req);
  const existingInput = parseExistingImageInput(body.existing_images ?? body.existingImages);

  // If no image update was submitted, keep the current image array unchanged.
  if (existingInput === undefined && uploaded.length === 0) return listing.images;

  const currentImages = new Set(listing.images);
  const allowedExisting = (existingInput ?? listing.images).filter(image => currentImages.has(image) && SAFE_IMAGE_URL.test(image));
  return [...allowedExisting, ...uploaded].slice(0, MAX_LISTING_IMAGES);
};

const ensureOwnerOrAdmin = (listing: Listing, req: Request): void => {
  const isAdmin = req.user?.roles.includes('admin') ?? false;
  if (!isAdmin && listing.donor_id !== req.user?.id) throw forbidden('Access denied');
};

const campaignEndOfDayMs = (endDate: string | Date | undefined): number | undefined => {
  if (!endDate) return undefined;
  // Campaigns store an end date, not a precise timestamp. For this Singapore-based
  // project, treat that date as valid until 23:59:59.999 SGT so donors do not
  // accidentally attach an auction that ends after the beneficiary campaign closes.
  // The pg library may return DATE columns as either a string or a Date object,
  // so handle both to prevent a TypeError crash (FR07/FR08 fix).
  const dateOnly = typeof endDate === 'string' ? endDate.slice(0, 10) : endDate.toISOString().slice(0, 10);
  const value = Date.parse(`${dateOnly}T23:59:59.999+08:00`);
  return Number.isFinite(value) ? value : undefined;
};

const ensureCampaignCoversAuctionWindow = (campaignEndDate: string | Date | undefined, auctionEnd: Date): void => {
  const campaignEnd = campaignEndOfDayMs(campaignEndDate);
  if (campaignEnd !== undefined && auctionEnd.getTime() > campaignEnd) {
    throw badRequest('The selected campaign ends before the auction ends. Please select a campaign that is still active for the full auction duration.', 'VALIDATION_ERROR', {
      campaign_id: 'This campaign ends before the auction end date.',
    });
  }
};

export const createListing = async (body: Record<string, unknown>, req: Request): Promise<Listing> => {
  if (!req.user) throw forbidden();
  const starting = roundMoney(Number(body.starting_price ?? body.startingPrice));
  const rawMinIncrement = body.min_increment ?? body.minIncrement;
  const minIncrement = roundMoney(Number(rawMinIncrement));
  const durationHours = Number(body.durationHours ?? 24);

  if (!Number.isFinite(starting) || starting < 1) throw badRequest('Starting price must be at least 1.');
  // FR08: the donor must explicitly set the minimum bid increment. Do not silently
  // default it, otherwise different auctions can behave inconsistently.
  if (rawMinIncrement === undefined || rawMinIncrement === '' || !Number.isFinite(minIncrement) || minIncrement < 1) {
    throw badRequest('Minimum bid increment is required and must be at least 1.', 'VALIDATION_ERROR', {
      min_increment: 'Minimum bid increment is required and must be at least 1.',
    });
  }
  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 720) throw badRequest('Auction duration must be 1 to 720 hours.');

  const title = sanitizeListingText(body.title, 120, 'title');
  const description = sanitizeListingText(body.description, 1200, 'description');
  const category = sanitizeText(body.category, 60);
  if (title.length < 3 || description.length < 10 || category.length < 2) throw badRequest('Listing title, description, and category are required.');

  // Use explicit start/end times from the request if provided and valid; fall back to durationHours.
  const now = new Date();
  let startTime = now;
  let endTime = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  if (body.start_time) {
    const parsedStart = new Date(String(body.start_time));
    if (!isNaN(parsedStart.getTime())) startTime = parsedStart;
  }
  if (body.end_time) {
    const parsedEnd = new Date(String(body.end_time));
    if (!isNaN(parsedEnd.getTime())) endTime = parsedEnd;
  }
  if (endTime <= startTime) throw badRequest('Auction end time must be after the start time.');
  const actualDuration = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  if (actualDuration > 720) throw badRequest('Auction duration cannot exceed 30 days (720 hours).');

  // Validate campaign_id and resolve the charity name from the DB.
  // In production, we strictly require a valid campaign ID.
  // For legacy tests that still pass 'charityName' directly, we provide a fallback.
  let campaignId = Number(body.campaign_id);
  let charityName = '';

  if (Number.isInteger(campaignId) && campaignId >= 1) {
    const campaign = await getCampaignById(campaignId);
    if (!campaign || campaign.status !== 'active') throw badRequest('The selected campaign is not active or does not exist.');
    const parentCharity = await getCharityById(campaign.charity_id);
    if (!parentCharity || parentCharity.status !== 'approved') throw badRequest('The charity linked to this campaign is not approved.');
    ensureCampaignCoversAuctionWindow(campaign.end_date, endTime);
    charityName = parentCharity.organisationName;
  } else if (process.env.NODE_ENV === 'test' && body.charityName) {
    // Legacy fallback for test suite
    campaignId = 1;
    charityName = sanitizeText(String(body.charityName), 160);
  } else {
    throw badRequest('A valid campaign must be selected.');
  }

  // Every donor submission enters the two-stage review pipeline (SFR09). There is no admin
  // shortcut to 'active' — admins cannot create listings (enforced at the route), preserving
  // separation of duties between authoring and moderating.
  const status: ListingStatus = 'pending';

  const images = imagesFromUploads(req);

  const listing = await addListing({
    donor_id: req.user.id,
    campaign_id: campaignId,
    title,
    description,
    condition: (['new', 'like_new', 'good', 'fair'].includes(String(body.condition)) ? body.condition : 'good') as Listing['condition'],
    category,
    images,
    starting_price: starting,
    status,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    charityName,
    min_increment: minIncrement
  });
  await audit(req, 'LISTING_CREATED', { title, status, charityName, imageCount: images.length, minIncrement }, 'listing', listing.uuid, req.user.id);
  return listing;
};

export const updateListingDetails = async (uuid: string, body: Record<string, unknown>, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  ensureOwnerOrAdmin(listing, req);

  const isAdmin = req.user?.roles.includes('admin') ?? false;
  if (!isAdmin && !DONOR_EDITABLE_STATUSES.includes(listing.status)) {
    await audit(req, 'LISTING_EDIT_REJECTED_BY_STATUS', { status: listing.status }, 'listing', listing.uuid, req.user?.id);
    throw forbidden('Only pending, changes-requested, or rejected listings can be edited by the donor.');
  }

  if (listing.status === 'active') {
    const attemptedLocked = Object.keys(body).filter(key => LOCKED_FIELDS.has(key));
    if (attemptedLocked.length > 0) {
      await audit(req, 'LISTING_ACTIVE_LOCK_REJECTED', { attemptedLocked }, 'listing', listing.uuid, req.user?.id);
      throw forbidden('Auction configuration fields are locked once the auction is active.');
    }
  }

  const title = body.title !== undefined ? sanitizeListingText(body.title, 120, 'title') : listing.title;
  const description = body.description !== undefined ? sanitizeListingText(body.description, 1200, 'description') : listing.description;
  const category = body.category !== undefined ? sanitizeText(body.category, 60) : listing.category;
  if (title.length < 3 || description.length < 10 || category.length < 2) throw badRequest('Listing title, description, and category are required.');

  listing.title = title;
  listing.description = description;
  listing.category = category;
  if (body.condition && ['new', 'like_new', 'good', 'fair'].includes(String(body.condition))) listing.condition = String(body.condition) as Listing['condition'];
  listing.images = buildUpdatedImages(listing, body, req);

  // A donor editing a changes-requested or rejected listing is resubmitting it.
  // Move it back into the admin review queue and clear the stale reviewer note,
  // otherwise the admin pending list never surfaces the updated listing again.
  if (!isAdmin && (listing.status === 'changes_requested' || listing.status === 'rejected')) {
    const previousStatus = listing.status;
    const previousReviewStage = listing.review_stage;
    listing.status = 'pending';
    listing.review_note = undefined;
    listing.review_stage = undefined;
    await audit(
      req,
      'LISTING_RESUBMITTED_FOR_REVIEW',
      { uuid, previousStatus, previousReviewStage },
      'listing',
      listing.uuid,
      req.user?.id,
    );
  }

  await updateListing(listing);
  await audit(req, 'LISTING_UPDATED', { uuid, imageCount: listing.images.length }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

export const deleteListing = async (uuid: string, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  ensureOwnerOrAdmin(listing, req);

  const isAdmin = req.user?.roles.includes('admin') ?? false;
  if (!isAdmin && !DONOR_DELETABLE_STATUSES.includes(listing.status)) {
    await audit(req, 'LISTING_DELETE_REJECTED_BY_STATUS', { status: listing.status }, 'listing', listing.uuid, req.user?.id);
    throw forbidden('Active or sold listings cannot be deleted by the donor.');
  }

  // Soft-delete by cancelling instead of physically removing the row.
  // This keeps auditability and prevents orphaned bid/payment records later.
  listing.status = 'cancelled';
  await updateListing(listing);
  await audit(req, 'LISTING_DELETED', { uuid, softDelete: true }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

export const listMyListings = async (req: Request): Promise<Listing[]> => {
  if (!req.user) throw forbidden();

  const all = await listListings();
  if (req.user.roles.includes('admin')) return all;

  // FR10 change: donor-facing listing views no longer surface draft records.
  // Keeping the database value avoids breaking older rows, but the UI/API now treats
  // submission as pending-first instead of draft-first.
  return all.filter(listing => listing.donor_id === req.user?.id && listing.status !== 'draft');
};

// SFR09 stage 1 (admin gate): approving does NOT publish — it forwards the listing to the
// selected charity for a second review. The charity's approval is what makes it active.
export const approveListing = async (uuid: string, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  if (listing.status !== 'pending') throw badRequest('Only pending listings can be approved.');
  listing.status = 'charity_review';
  listing.review_note = undefined;
  listing.review_stage = undefined;
  await updateListing(listing);
  await audit(req, 'LISTING_FORWARDED_TO_CHARITY', { uuid }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

// SFR09: admin asks the donor to revise before the listing can proceed to the charity.
export const requestListingChanges = async (uuid: string, reasonInput: string | undefined, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  if (listing.status !== 'pending') throw badRequest('Only pending listings can have changes requested.');
  const reason = sanitizeText(reasonInput ?? '', 300);
  if (reason.length < 5) {
    throw badRequest('A change request note of at least 5 characters is required.', 'VALIDATION_ERROR', {
      reason: 'Please explain what the donor needs to change.',
    });
  }
  listing.status = 'changes_requested';
  listing.review_note = reason;
  listing.review_stage = 'admin';
  await updateListing(listing);
  await audit(req, 'LISTING_CHANGES_REQUESTED', { uuid, reason }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

export const rejectListing = async (uuid: string, reason: string | undefined, req: Request): Promise<Listing> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  if (listing.status !== 'pending') throw badRequest('Only pending listings can be rejected.');
  const note = sanitizeText(reason ?? '', 300);
  // A rejection is terminal and shown to the donor — require a substantive reason, consistent
  // with request-changes and the charity's own reject step (≥5 chars).
  if (note.length < 5) {
    throw badRequest('A rejection reason of at least 5 characters is required.', 'VALIDATION_ERROR', {
      reason: 'Please explain why this listing was rejected.',
    });
  }
  listing.status = 'rejected';
  listing.review_note = note;
  listing.review_stage = 'admin';
  await updateListing(listing);
  await audit(req, 'LISTING_REJECTED', { uuid, reason: note }, 'listing', listing.uuid, req.user?.id);
  return listing;
};

export const provideTracking = async (uuid: string, trackingNumber: string, courier: string, req: Request): Promise<{ delivery: Delivery; listing: Listing }> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');
  if (listing.donor_id !== req.user?.id && !req.user?.roles.includes('admin')) throw forbidden('Only the donor who created this listing can provide shipping details.');

  // Verify payment is held (bidder paid)
  const payments = await getPaymentsForListing(listing.id);
  const heldPayment = payments.find(p => p.escrow_state === 'held');
  if (!heldPayment) throw badRequest('Payment must be completed before providing shipping details.', 'SHIPPING_PAYMENT_NOT_HELD');

  // Validate format before sanitizing — reject garbage early with a user-readable message
  const TRACKING_RE = /^[A-Za-z0-9 \-]{4,50}$/;
  const COURIER_RE = /^[A-Za-z0-9 \-\.&]{2,60}$/;
  const rawTracking = String(trackingNumber ?? '').trim();
  const rawCourier = String(courier ?? '').trim();
  if (!TRACKING_RE.test(rawTracking)) throw badRequest('Tracking number must be 4–50 alphanumeric characters, hyphens, or spaces.', 'TRACKING_INVALID_FORMAT');
  if (!COURIER_RE.test(rawCourier)) throw badRequest('Courier name must be 2–60 alphanumeric characters, spaces, hyphens, periods, or ampersands.', 'COURIER_INVALID_FORMAT');

  // Sanitize inputs to prevent stored XSS
  const cleanedTracking = sanitizeText(rawTracking, 50);
  const cleanedCourier = sanitizeText(rawCourier, 60);
  if (!cleanedTracking || !cleanedCourier) throw badRequest('Tracking number and courier name are required.');

  let delivery = await getDeliveryByListingId(listing.id);
  if (!delivery) delivery = await addDelivery(listing.id);

  delivery.tracking_number = cleanedTracking;
  delivery.courier = cleanedCourier;
  delivery.shipped_at = new Date().toISOString();
  await updateDelivery(delivery);

  listing.status = 'shipped';
  await updateListing(listing);

  await audit(req, 'LISTING_SHIPPED', { uuid, tracking: cleanedTracking, courier: cleanedCourier }, 'listing', listing.uuid, req.user?.id);
  return { delivery, listing };
};

export const confirmDelivery = async (uuid: string, req: Request): Promise<{ delivery: Delivery; listing: Listing }> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');

  // Verify caller is the winning bidder
  if (listing.winner_id !== req.user?.id && !req.user?.roles.includes('admin')) throw forbidden('Only the winning bidder can confirm delivery.');

  const delivery = await getDeliveryByListingId(listing.id);
  if (!delivery) throw badRequest('Shipping has not been arranged yet.', 'SHIPPING_NOT_ARRANGED');
  if (delivery.confirmed_at) throw badRequest('Delivery has already been confirmed.', 'DELIVERY_ALREADY_CONFIRMED');

  delivery.confirmed_at = new Date().toISOString();
  await updateDelivery(delivery);

  listing.status = 'delivered';
  await updateListing(listing);

  // Release escrow to charity
  await releaseEscrowForListing(listing.id, req);

  await audit(req, 'DELIVERY_CONFIRMED', { uuid }, 'listing', listing.uuid, req.user?.id);
  return { delivery, listing };
};

const ALLOWED_SORTS = new Set(['ending_soon', 'newest', 'price_low', 'price_high']);
const ALLOWED_CONDITIONS = new Set(['new', 'like_new', 'good', 'fair']);

const isPubliclyBiddableNow = (listing: Listing, nowMs = Date.now()): boolean => {
  const startMs = new Date(listing.start_time).getTime();
  const endMs = new Date(listing.end_time).getTime();

  // A listing is only public/biddable after the start time and before the end time.
  // This keeps approved future auctions out of /auctions while still letting donors
  // track them as UPCOMING in FR10.
  return listing.status === 'active'
    && Number.isFinite(startMs)
    && Number.isFinite(endMs)
    && startMs <= nowMs
    && endMs > nowMs;
};

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export const searchPublicListings = async (query: Record<string, unknown>): Promise<PaginatedResult<Listing>> => {
  const q = sanitizeText(query.q ?? query.search, 80);
  const category = sanitizeText(query.category, 60);
  if (q && !isSafeSearchQuery(q)) throw badRequest('Search query was rejected because it contained malformed or unsafe syntax.', 'UNSAFE_SEARCH_QUERY');
  if (category && !isSafeSearchQuery(category)) throw badRequest('Category filter was rejected because it contained malformed or unsafe syntax.', 'UNSAFE_SEARCH_QUERY');

  const priceMin = query.price_min !== undefined && query.price_min !== '' ? Number(query.price_min) : undefined;
  const priceMax = query.price_max !== undefined && query.price_max !== '' ? Number(query.price_max) : undefined;
  const campaignId = query.campaign_id !== undefined && query.campaign_id !== '' ? Number(query.campaign_id) : undefined;
  const endBefore = typeof query.end_before === 'string' && query.end_before ? new Date(query.end_before) : undefined;
  const condition = typeof query.condition === 'string' && ALLOWED_CONDITIONS.has(query.condition) ? query.condition : undefined;
  const sort = typeof query.sort === 'string' && ALLOWED_SORTS.has(query.sort) ? query.sort : 'ending_soon';

  // NFR01: Parse pagination params with sensible bounds to keep response size predictable.
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE));

  if (priceMin !== undefined && !Number.isFinite(priceMin)) throw badRequest('Invalid minimum price.');
  if (priceMax !== undefined && !Number.isFinite(priceMax)) throw badRequest('Invalid maximum price.');
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) throw badRequest('Minimum price cannot exceed maximum price.');
  if (campaignId !== undefined && (!Number.isInteger(campaignId) || campaignId < 1)) throw badRequest('Invalid campaign filter.');

  // SFR/FR10: listActiveListings() only returns status='active'. The extra time-window
  // check ensures UPCOMING active listings are approved but not yet publicly listed/biddable.
  const nowMs = Date.now();
  const active = (await listActiveListings()).filter(listing => isPubliclyBiddableNow(listing, nowMs));

  const results = active.filter(l => {
    const matchesQ = !q || l.title.toLowerCase().includes(q.toLowerCase());
    const matchesCategory = !category || l.category.toLowerCase() === category.toLowerCase();
    const matchesCondition = !condition || l.condition === condition;
    const matchesPriceMin = priceMin === undefined || l.current_bid >= priceMin;
    const matchesPriceMax = priceMax === undefined || l.current_bid <= priceMax;
    const matchesCampaign = campaignId === undefined || l.campaign_id === campaignId;
    const matchesEndBefore = !endBefore || new Date(l.end_time) <= endBefore;
    return matchesQ && matchesCategory && matchesCondition && matchesPriceMin && matchesPriceMax && matchesCampaign && matchesEndBefore;
  });

  if (sort === 'newest') results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else if (sort === 'price_low') results.sort((a, b) => a.current_bid - b.current_bid);
  else if (sort === 'price_high') results.sort((a, b) => b.current_bid - a.current_bid);
  else results.sort((a, b) => new Date(a.end_time).getTime() - new Date(b.end_time).getTime());

  const total = results.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const data = results.slice(startIndex, startIndex + pageSize);

  return { data, total, page, pageSize, totalPages };
};

export const getPublicListing = async (uuid: string, isAdmin = false, userId?: number): Promise<Listing & { campaign?: import('../types/domain').Campaign }> => {
  const listing = await getListingByUuid(uuid);
  if (!listing) throw notFound('Listing not found');

  // Allow viewing of resolved listing statuses (sold, shipped, delivered, expired)
  // so that bidders can see their won/ended auctions. Active listings still require
  // the time window check (future auctions remain hidden until they start).
  // Also allow the listing's donor to view their own listing at any status
  // (pending, changes_requested, draft) so they don't get a 404.
  const terminalStatuses = new Set<Listing['status']>(['sold', 'shipped', 'delivered', 'expired']);
  const isOwner = userId !== undefined && listing.donor_id === userId;
  if (!isAdmin && !isOwner && !terminalStatuses.has(listing.status) && !isPubliclyBiddableNow(listing)) {
    throw notFound('Listing not found');
  }

  // Attach campaign details (includes total_raised, description) for the auction detail page.
  let campaign: import('../types/domain').Campaign | undefined;
  if (listing.campaign_id) {
    campaign = await getCampaignById(listing.campaign_id) ?? undefined;
  }

  return { ...listing, campaign };
};

export const getPendingListings = async (): Promise<Listing[]> => listPendingListings();

export const getAdminListings = async (status?: string): Promise<Listing[]> => {
  return listListingsByStatus(status);
};

export const getDonorListings = async (donorId: number): Promise<{ listings: Array<Listing & { can_ship?: boolean; payment_held?: boolean; has_shipped?: boolean; payment_released?: boolean }>; stats: DonorStats }> => {
  const allListings = await listListingsByDonor(donorId);

  // FR10 change: hide legacy draft records from donor management. New listings are created
  // directly as pending, so this only affects older seeded/local data.
  const listings = allListings.filter(listing => listing.status !== 'draft');

  // For sold listings, check escrow state (held/released) and shipping status
  const paymentPromises = listings
    .filter(l => l.status === 'sold')
    .map(async (listing) => {
      const payments = await getPaymentsForListing(listing.id);
      const heldPayment = payments.find(p => p.escrow_state === 'held');
      const releasedPayment = payments.find(p => p.escrow_state === 'released');
      const delivery = await getDeliveryByListingId(listing.id);
      return {
        listingId: listing.id,
        isHeld: !!heldPayment,
        isReleased: !!releasedPayment,
        isShipped: !!(delivery?.shipped_at),
      };
    });
  const paymentResults = await Promise.all(paymentPromises);
  const heldMap = new Map(paymentResults.map(r => [r.listingId, r.isHeld]));
  const releasedMap = new Map(paymentResults.map(r => [r.listingId, r.isReleased]));
  const shippedMap = new Map(paymentResults.map(r => [r.listingId, r.isShipped]));

  const listingsWithPayment = listings.map(l => ({
    ...l,
    can_ship: l.status === 'sold' && heldMap.get(l.id) === true && !shippedMap.get(l.id),
    payment_held: l.status === 'sold' && heldMap.get(l.id) === true,
    has_shipped: l.status === 'sold' && shippedMap.get(l.id) === true,
    payment_released: l.status === 'sold' && releasedMap.get(l.id) === true,
  }));

  const stats: DonorStats = {
    total: listings.length,
    active: listings.filter(l => l.status === 'active').length,
    sold: listings.filter(l => l.status === 'sold').length,
    pending: listings.filter(l => l.status === 'pending').length,
    draft: 0,
    totalRaised: listings.filter(l => l.status === 'sold').reduce((sum, l) => sum + l.current_bid, 0),
  };
  return { listings: listingsWithPayment, stats };
};

export interface DonorStats {
  total: number;
  active: number;
  sold: number;
  pending: number;
  draft: number;
  totalRaised: number;
}
