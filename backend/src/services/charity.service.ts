import type { Request } from 'express';
import type { CharityOrganisation, Listing } from '../types/domain';
import { addCharity, getCharityByUuid, getPaymentsForListing, listCampaignsByCharity, listCharities, listListings, updateCharity, deleteCharityByUuid } from '../repositories';
import { badRequest, notFound } from '../utils/errors';
import { sanitizeText, sha256 } from '../utils/security';
import { audit } from './audit.service';

const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);

const detectMime = (buffer: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | undefined => {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') return 'application/pdf';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  return undefined;
};

export const registerCharity = async (req: Request): Promise<CharityOrganisation> => {
  if (!req.user) throw badRequest('Authentication required');

  const allCharities = await listCharities();
  const existing = allCharities.find(c => c.ownerUserId === req.user!.id);
  if (existing) {
    if (existing.status === 'pending') {
      throw badRequest('Your charity registration is already pending review.', 'CHARITY_PENDING_REVIEW');
    }
    if (existing.status === 'rejected') {
      await deleteCharityByUuid(existing.uuid);
    }
  }

  const file = req.file;
  const organisationName = sanitizeText(req.body.organisationName ?? req.body.name, 160);
  const description = sanitizeText(req.body.description, 1000);
  if (organisationName.length < 2) throw badRequest('Organisation name is required.', 'VALIDATION_ERROR', { organisationName: 'Organisation name is required.' });
  if (description.length < 10) throw badRequest('Description must be at least 10 characters.', 'VALIDATION_ERROR', { description: 'Description must be at least 10 characters.' });
  if (!file || !file.buffer) throw badRequest('Supporting document is required.', 'DOCUMENT_REQUIRED');
  if (file.size > 5 * 1024 * 1024) throw badRequest('Supporting document exceeds 5MB.', 'DOCUMENT_TOO_LARGE');
  const detected = detectMime(file.buffer);
  if (!detected || detected !== file.mimetype || !ALLOWED_MIME.has(detected)) {
    await audit(req, 'CHARITY_DOCUMENT_REJECTED', { filename: file.originalname, mimetype: file.mimetype }, 'charity_application');
    throw badRequest('Only PDF, PNG, or JPG supporting documents are accepted.', 'UNSUPPORTED_DOCUMENT');
  }
  const record = await addCharity({
    ownerUserId: req.user.id,
    organisationName,
    description,
    documentName: sanitizeText(file.originalname, 120),
    documentMime: detected,
    documentSha256: sha256(file.buffer),
    documentData: file.buffer
  });
  await audit(req, 'CHARITY_REGISTER_PENDING', { organisationName, documentSha256: record.documentSha256 }, 'charity', record.uuid, req.user.id);
  return record;
};

export const reviewCharity = async (uuid: string, decision: 'approved' | 'rejected', reason: string | undefined, req: Request): Promise<CharityOrganisation> => {
  const record = await getCharityByUuid(uuid);
  if (!record) throw notFound('Charity registration not found');
  if (!['approved', 'rejected'].includes(decision)) throw badRequest('Decision must be approved or rejected.');
  if (record.status !== 'pending') throw badRequest('Only pending charity registrations can be reviewed.', 'CHARITY_ALREADY_REVIEWED');
  record.status = decision;
  record.reviewedBy = req.user?.id;
  record.reviewedAt = new Date().toISOString();
  record.rejectionReason = decision === 'rejected' ? sanitizeText(reason, 300) : undefined;
  await updateCharity(record);
  await audit(req, 'CHARITY_REVIEWED', { decision, reason: record.rejectionReason }, 'charity', record.uuid, req.user?.id);
  return record;
};

export const getCharities = async (): Promise<CharityOrganisation[]> => listCharities();

// Public-facing: only expose approved organisations so donors can select them when creating listings.
export const getApprovedCharities = async (): Promise<CharityOrganisation[]> => {
  const all = await listCharities();
  return all.filter(c => c.status === 'approved');
};

export const streamCharityDocument = async (uuid: string): Promise<{ data: Buffer; mime: string } | null> => {
  const charity = await getCharityByUuid(uuid);
  if (!charity || !charity.documentData) return null;
  return { data: charity.documentData, mime: charity.documentMime };
};

export const getCharityDashboard = async (ownerUserId: number, charityId?: number): Promise<{ charity: CharityOrganisation | null; listings: Listing[]; stats: CharityStats }> => {
  const allCharities = await listCharities();
  const charity = charityId
    ? allCharities.find(c => c.id === charityId) ?? null
    : allCharities.find(c => c.ownerUserId === ownerUserId) ?? null;

  const allListings = await listListings();
  // FR09/FR20: use the actual campaign ownership relation instead of the
  // denormalised charityName text stored on each listing. This keeps the
  // dashboard and review counts accurate even if a charity name changes, and
  // prevents listings from another charity with a similar name from appearing.
  const charityCampaigns = charity ? await listCampaignsByCharity(charity.id) : [];
  const campaignIds = new Set(charityCampaigns.map(campaign => campaign.id));

  // Strict FR09 routing rule:
  // - Donor-created listings stay invisible to the charity while status='pending'
  //   because they are still waiting for the first admin check.
  // - The charity only sees listings after the admin forwards them to
  //   status='charity_review', plus listings that have already completed the
  //   charity stage and became auction/history records.
  // - Admin-side rejections/changes-requested are not routed to the charity.
  const charityRoutedStatuses = new Set<Listing['status']>([
    'charity_review',
    'active',
    'sold',
    'shipped',
    'delivered',
    'expired',
    'cancelled',
  ]);
  const listings = allListings.filter(l =>
    campaignIds.has(l.campaign_id) &&
    (charityRoutedStatuses.has(l.status) || (l.status === 'rejected' && l.review_stage === 'charity')),
  );

  // Fetch payments for each sold listing to compute fund statistics and per-item flags
  const soldListings = listings.filter(l => l.status === 'sold');
  const paymentResults = await Promise.all(
    soldListings.map(async (listing) => {
      const payments = await getPaymentsForListing(listing.id);
      const released = payments.find(p => p.escrow_state === 'released');
      const held = payments.find(p => p.escrow_state === 'held');
      return {
        listingId: listing.id,
        isReleased: !!released,
        isHeld: !!held,
        releasedAmount: released?.amount ?? 0,
        heldAmount: held?.amount ?? 0,
      };
    }),
  );
  const releasedMap = new Map(paymentResults.map(r => [r.listingId, r.isReleased]));
  const heldMap = new Map(paymentResults.map(r => [r.listingId, r.isHeld]));

  // Enrich sold listings with payment flags
  const enrichedListings = listings.map(l => {
    if (l.status === 'sold') {
      const r = paymentResults.find(p => p.listingId === l.id);
      return {
        ...l,
        payment_released: r?.isReleased ?? false,
        payment_held: r?.isHeld ?? false,
      };
    }
    return l;
  });

  const stats: CharityStats = {
    totalItems: listings.length,
    activeItems: listings.filter(l => l.status === 'active').length,
    totalRaised: listings.filter(l => l.status === 'sold').reduce((sum, l) => sum + l.current_bid, 0),
    paymentsReceived: paymentResults.reduce((sum, r) => r.isReleased ? sum + r.releasedAmount : sum, 0),
    paymentsPending: paymentResults.reduce((sum, r) => r.isHeld ? sum + r.heldAmount : sum, 0),
    paymentsReleasedCount: paymentResults.filter(r => r.isReleased).length,
    paymentsHeldCount: paymentResults.filter(r => r.isHeld).length,
  };
  return { charity, listings: enrichedListings, stats };
};

export interface CharityStats {
  totalItems: number;
  activeItems: number;
  totalRaised: number;
  paymentsReceived: number;
  paymentsPending: number;
  paymentsReleasedCount: number;
  paymentsHeldCount: number;
}