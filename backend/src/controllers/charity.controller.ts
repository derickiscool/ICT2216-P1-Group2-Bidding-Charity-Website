import type { Request, Response } from 'express';
import { getCharities, registerCharity, reviewCharity } from '../services/charity.service';

export const createCharityRegistration = async (req: Request, res: Response): Promise<void> => {
  const charity = await registerCharity(req);
  res.status(201).json(charity);
};

export const listCharityRegistrations = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getCharities());
};

export const reviewCharityRegistration = async (req: Request, res: Response): Promise<void> => {
  const charity = await reviewCharity(req.params.uuid, req.body.decision, req.body.reason, req);
  res.json(charity);
};
