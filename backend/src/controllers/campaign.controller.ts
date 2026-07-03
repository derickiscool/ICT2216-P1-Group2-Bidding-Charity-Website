import type { Request, Response } from 'express';
import { closeManagedCampaign, createManagedCampaign, listManagedCampaigns, streamCampaignImage, updateManagedCampaign } from '../services/campaign.service';

export const getCampaigns = async (req: Request, res: Response): Promise<void> => {
  res.json(await listManagedCampaigns(req));
};

export const postCampaign = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createManagedCampaign(req));
};

export const putCampaign = async (req: Request, res: Response): Promise<void> => {
  res.json(await updateManagedCampaign(req, req.params.uuid));
};

export const patchCloseCampaign = async (req: Request, res: Response): Promise<void> => {
  res.json(await closeManagedCampaign(req, req.params.uuid));
};

export const getCampaignImage = async (req: Request, res: Response): Promise<void> => {
  const image = await streamCampaignImage(req.params.uuid);
  if (!image) { res.status(404).json({ message: 'No image for this campaign.' }); return; }
  res.setHeader('Content-Type', image.mime);
  res.setHeader('Cache-Control', 'no-cache');
  res.send(image.data);
};
