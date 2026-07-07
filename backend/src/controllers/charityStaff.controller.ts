import type { Request, Response } from 'express';
import {
  createManagedStaff,
  deactivateManagedStaff,
  listManagedStaff,
  reactivateManagedStaff,
} from '../services/charityStaff.service';

export const getCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.json(await listManagedStaff(req));
};

export const createCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createManagedStaff(req));
};

export const deactivateCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.json(await deactivateManagedStaff(req, req.params.uuid));
};

export const reactivateCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.json(await reactivateManagedStaff(req, req.params.uuid));
};
