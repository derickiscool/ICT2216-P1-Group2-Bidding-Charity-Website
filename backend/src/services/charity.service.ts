import type { Request } from 'express';
import type { CharityOrganisation, Listing, Payment } from '../types/domain';
import { addCharity, findUserById, getCharityById, getCharityByUuid, getPaymentsForListing, listCharities, listListings, updateCharity } from '../repositories';
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

export const getCharityDashboard = async (userId: number): Promise<{ charity: CharityOrganisation | null; listings: Listing[]; stats: CharityStats }> => {
  const user = await findUserById(userId);
  if (!user) throw notFound('User not found.');

  let charity: CharityOrganisation | null = null;

  if (user.roles.includes('charity_staff') && user.charityId) {
    // Charity Staff do not own the organisation record.
    // Their access is linked through users.charity_id, so resolve the dashboard
    // from that charity association instead of ownerUserId.
    charity = (await getCharityById(user.charityId)) ?? null;
  } else {
    const allCharities = await listCharities();
    charity = allCharities.find(c => c.ownerUserId === userId) ?? null;
  }

  const allListings = await listListings();
  const organisationName = charity?.organisationName ?? '';
  const listings = charity
    ? allListings.filter(l => l.charityName.toLowerCase() === organisationName.toLowerCase())
    : [];

  // Fetch payments for this charity's listings to compute fund statistics.
  const allPayments: Payment[] = (
    await Promise.all(listings.map(l => getPaymentsForListing(l.id)))
  ).flat();

  const paymentsReleased = allPayments.filter(p => p.escrow_state === 'released');
  const paymentsHeld = allPayments.filter(p => p.escrow_state === 'held');

  const stats: CharityStats = {
    totalItems: listings.length,
    activeItems: listings.filter(l => l.status === 'active').length,
    totalRaised: listings.filter(l => l.status === 'sold').reduce((sum, l) => sum + l.current_bid, 0),
    paymentsReceived: paymentsReleased.reduce((sum, p) => sum + p.amount, 0),
    paymentsPending: paymentsHeld.reduce((sum, p) => sum + p.amount, 0),
    paymentsReleasedCount: paymentsReleased.length,
    paymentsHeldCount: paymentsHeld.length,
  };

  return { charity, listings, stats };
};

  const allListings = await listListings();
  const organisationName = charity?.organisationName ?? '';
  const listings = charity ? allListings.filter(l => l.charityName.toLowerCase() === organisationName.toLowerCase()) : [];

  // Fetch payments for this charity's listings to compute fund statistics.
  const allPayments: Payment[] = (
    await Promise.all(listings.map(l => getPaymentsForListing(l.id)))
  ).flat();

  const paymentsReleased = allPayments.filter(p => p.escrow_state === 'released');
  const paymentsHeld = allPayments.filter(p => p.escrow_state === 'held');

  const stats: CharityStats = {
    totalItems: listings.length,
    activeItems: listings.filter(l => l.status === 'active').length,
    totalRaised: listings.filter(l => l.status === 'sold').reduce((sum, l) => sum + l.current_bid, 0),
    paymentsReceived: paymentsReleased.reduce((sum, p) => sum + p.amount, 0),
    paymentsPending: paymentsHeld.reduce((sum, p) => sum + p.amount, 0),
    paymentsReleasedCount: paymentsReleased.length,
    paymentsHeldCount: paymentsHeld.length,
  };
  return { charity, listings, stats };
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