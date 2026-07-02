import type { Request, Response } from 'express';
import { createManagedStaff, deactivateManagedStaff, listManagedStaff, updateManagedStaff } from '../services/charityStaff.service';

export const getCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.json(await listManagedStaff(req));
};

export const createCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.status(201).json(await createManagedStaff(req));
};

export const updateCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.json(await updateManagedStaff(req, req.params.uuid));
};

export const deactivateCharityStaff = async (req: Request, res: Response): Promise<void> => {
  res.json(await deactivateManagedStaff(req, req.params.uuid));
};
