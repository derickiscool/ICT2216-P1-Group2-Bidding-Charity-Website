import type { Request, Response } from 'express';
import { getApprovedCharities, getCharities, getCharityDashboard, registerCharity, reviewCharity } from '../services/charity.service';
import { listAllActiveCampaigns } from '../repositories';

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
  // Shape the response to only expose what the public needs (no internal document hashes, etc.)
  res.json(
    charities.map(c => ({
      id: c.id,
      name: c.organisationName,
      description: c.description,
    }))
  );
};

export const reviewCharityRegistration = async (req: Request, res: Response): Promise<void> => {
  const charity = await reviewCharity(req.params.uuid, req.body.decision, req.body.reason, req);
  res.json(charity);
};

// Public endpoint — returns all active campaigns so donors can pick one when creating a listing.
export const listPublicCampaigns = async (_req: Request, res: Response): Promise<void> => {
  const campaigns = await listAllActiveCampaigns();
  res.json(
    campaigns.map(c => ({
      id: c.id,
      uuid: c.uuid,
      name: c.name,
      description: c.description,
      hasImage: c.hasImage,
    }))
  );
};

export const charityDashboard = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) return;
  res.json(await getCharityDashboard(req.user.id));
};
