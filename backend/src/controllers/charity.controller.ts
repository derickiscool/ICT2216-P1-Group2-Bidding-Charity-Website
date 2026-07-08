import type { Request, Response } from 'express';
import { getApprovedCharities, getCharities, getCharityDashboard, registerCharity, reviewCharity, streamCharityDocument } from '../services/charity.service';
import { getCharityById, listAllActiveCampaigns, listListings } from '../repositories';

export const createCharityRegistration = async (req: Request, res: Response): Promise<void> => {
  const charity = await registerCharity(req);
  res.status(201).json(charity);
};

export const listCharityRegistrations = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getCharities());
};

// Public endpoint — returns only approved charities for the donor listing creation form.
export const listApprovedCharities = async (_req: Request, res: Response): Promise<void> => {
  const charities = await getApprovedCharities();
  const allListings = await listListings();
  // Shape the response to only expose what the public needs (no internal document hashes, etc.)
  res.json(
    charities.map(c => {
      const charityListings = allListings.filter(
        l => l.charityName.toLowerCase() === c.organisationName.toLowerCase() && l.status === 'sold'
      );
      const totalRaised = charityListings.reduce((sum, l) => sum + Number(l.current_bid), 0);
      return {
        id: c.id,
        name: c.organisationName,
        description: c.description,
        totalRaised,
      };
    })
  );
};

export const reviewCharityRegistration = async (req: Request, res: Response): Promise<void> => {
  const charity = await reviewCharity(req.params.uuid, req.body.decision, req.body.reason, req);
  res.json(charity);
};

// Public endpoint — returns all active campaigns so donors can pick one when creating a listing.
export const listPublicCampaigns = async (_req: Request, res: Response): Promise<void> => {
  const campaigns = await listAllActiveCampaigns();

  // FR08: donors now pick target organisation first, then campaign. Include only
  // public charity/campaign fields so the UI can group campaigns without exposing
  // verification documents or private charity records.
  const response = await Promise.all(
    campaigns.map(async c => {
      const charity = await getCharityById(c.charity_id);
      if (!charity || charity.status !== 'approved') return null;
      return {
        id: c.id,
        uuid: c.uuid,
        name: c.name,
        description: c.description,
        charity_id: c.charity_id,
        charityName: charity.organisationName,
        end_date: c.end_date,
        hasImage: c.hasImage,
      };
    }),
  );

  res.json(response.filter(campaign => campaign !== null));
};

export const charityDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  const charityId = req.user.roles.includes('charity_staff') ? req.user.charityId : undefined;
  res.json(await getCharityDashboard(req.user.id, charityId));
};

export const getCharityDocument = async (req: Request, res: Response): Promise<void> => {
  const document = await streamCharityDocument(req.params.uuid);
  if (!document) { res.status(404).json({ message: 'No document for this charity.' }); return; }
  res.setHeader('Content-Type', document.mime);
  res.setHeader('Cache-Control', 'no-cache');
  res.send(document.data);
};