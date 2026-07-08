import type { Request } from 'express';
import type { Campaign, CharityOrganisation } from '../types/domain';
import {
  addCampaign, closeCampaign, getCampaignByUuid, getCampaignImage,
  getCharityById, getCharityByOwnerUserId, listCampaignsByCharity, updateCampaign,
} from '../repositories';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { safeString, containsScriptLikeContent, sanitizeText } from '../utils/security';
import { audit } from './audit.service';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const detectImageMime = (buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | undefined => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
};

const resolveManageableCharity = async (req: Request): Promise<CharityOrganisation> => {
  if (!req.user) throw badRequest('Authentication required');
  const { id, roles, charityId } = req.user;
  let charity: CharityOrganisation | undefined;
  if (roles.includes('charity')) {
    charity = await getCharityByOwnerUserId(id);
  } else if (roles.includes('charity_staff') && charityId) {
    charity = await getCharityById(charityId);
  }
  if (!charity) throw forbidden('No charity organisation is linked to this account.', 'CHARITY_NOT_LINKED');
  return charity;
};

const requireApproved = (charity: CharityOrganisation): void => {
  if (charity.status !== 'approved') {
    throw forbidden('Your organisation account must be approved before managing campaigns.', 'CHARITY_NOT_APPROVED');
  }
};

const validateCampaignFields = (body: Record<string, unknown>) => {
  const errors: Record<string, string> = {};
  const nameRaw = safeString(body.name, 90);
  if (containsScriptLikeContent(nameRaw)) {
    throw badRequest('Please remove script-like content from the campaign name.', 'UNSAFE_TEXT_CONTENT', { name: 'Please remove script-like content.' });
  }
  const descRaw = safeString(body.description, 600);
  if (containsScriptLikeContent(descRaw)) {
    throw badRequest('Please remove script-like content from the campaign description.', 'UNSAFE_TEXT_CONTENT', { description: 'Please remove script-like content.' });
  }
  const name = sanitizeText(nameRaw, 90);
  const description = sanitizeText(descRaw, 600);

  if (name.length < 5) errors.name = 'Campaign name must be at least 5 characters.';
  if (description.length < 20) errors.description = 'Description must be at least 20 characters.';
  if (Object.keys(errors).length > 0) throw badRequest('Campaign input failed validation.', 'VALIDATION_ERROR', errors);

  const endDate = typeof body.end_date === 'string' && body.end_date.trim() ? body.end_date.trim() : undefined;
  if (endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw badRequest('Invalid end date format.', 'VALIDATION_ERROR', { end_date: 'Must be YYYY-MM-DD.' });
    // The format check alone lets impossible dates (e.g. 2026-13-45) through to
    // Postgres, which rejects them with an unhandled 500. Round-trip through Date
    // so only real calendar dates reach the DB.
    const parsed = new Date(`${endDate}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== endDate) {
      throw badRequest('Invalid end date.', 'VALIDATION_ERROR', { end_date: 'Must be a valid calendar date.' });
    }
  }

  return { name, description, endDate };
};

const processUploadedImage = (file: Express.Multer.File | undefined) => {
  if (!file) return {};
  if (file.size > MAX_IMAGE_BYTES) throw badRequest('Campaign image must be 2MB or smaller.', 'IMAGE_TOO_LARGE');
  const detected = detectImageMime(file.buffer);
  if (!detected || !ALLOWED_IMAGE_MIME.has(detected) || detected !== file.mimetype) {
    throw badRequest('Campaign image must be a JPG, PNG or WEBP file.', 'UNSUPPORTED_IMAGE');
  }
  return { imageData: file.buffer, imageMime: detected };
};

export const listManagedCampaigns = async (req: Request): Promise<{ campaigns: Campaign[]; canManageCampaigns: boolean }> => {
  if (!req.user) throw badRequest('Authentication required');
  const charity = await resolveManageableCharity(req).catch(() => undefined);
  if (!charity) return { campaigns: [], canManageCampaigns: false };
  const campaigns = await listCampaignsByCharity(charity.id);
  return { campaigns, canManageCampaigns: charity.status === 'approved' };
};

export const createManagedCampaign = async (req: Request): Promise<Campaign> => {
  const charity = await resolveManageableCharity(req);
  requireApproved(charity);
  const { name, description, endDate } = validateCampaignFields(req.body);
  const { imageData, imageMime } = processUploadedImage(req.file);
  const campaign = await addCampaign({ charityId: charity.id, name, description, endDate, imageData, imageMime });
  await audit(req, 'CAMPAIGN_CREATED', { name }, 'campaign', campaign.uuid, req.user!.id);
  return campaign;
};

export const updateManagedCampaign = async (req: Request, campaignUuid: string): Promise<Campaign> => {
  const charity = await resolveManageableCharity(req);
  requireApproved(charity);
  const existing = await getCampaignByUuid(campaignUuid);
  if (!existing || existing.charity_id !== charity.id) throw notFound('Campaign not found.');
  if (existing.status === 'closed') throw badRequest('Closed campaigns cannot be edited.', 'CAMPAIGN_CLOSED');
  const { name, description, endDate } = validateCampaignFields(req.body);
  const imageUpdate = req.file
    ? processUploadedImage(req.file)
    : req.body.remove_image === 'true'
      ? { imageData: null, imageMime: null }
      : {};
  const campaign = await updateCampaign(campaignUuid, { name, description, endDate, ...imageUpdate });
  await audit(req, 'CAMPAIGN_UPDATED', { name }, 'campaign', campaign.uuid, req.user!.id);
  return campaign;
};

export const closeManagedCampaign = async (req: Request, campaignUuid: string): Promise<Campaign> => {
  const charity = await resolveManageableCharity(req);
  requireApproved(charity);
  const existing = await getCampaignByUuid(campaignUuid);
  if (!existing || existing.charity_id !== charity.id) throw notFound('Campaign not found.');
  if (existing.status === 'closed') throw badRequest('Campaign is already closed.', 'CAMPAIGN_ALREADY_CLOSED');
  const campaign = await closeCampaign(campaignUuid);
  await audit(req, 'CAMPAIGN_CLOSED', {}, 'campaign', campaign.uuid, req.user!.id);
  return campaign;
};

export const streamCampaignImage = async (campaignUuid: string) => {
  const image = await getCampaignImage(campaignUuid);
  return image ?? null;
};
