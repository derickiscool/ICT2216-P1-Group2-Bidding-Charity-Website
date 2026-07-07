import type { Request, Response } from 'express';
import { changePassword, requestPasswordChangeVerification, updateProfile } from '../services/profile.service';

export const patchProfile = async (req: Request, res: Response): Promise<void> => {
  const user = await updateProfile(req.user!.id, req.body, req);
  res.json({ message: 'Profile updated successfully.', user });
};

export const requestPasswordVerification = async (req: Request, res: Response): Promise<void> => {
  const result = await requestPasswordChangeVerification(req.user!.id, req.body, req);
  res.status(202).json(result);
};

export const putPassword = async (req: Request, res: Response): Promise<void> => {
  await changePassword(req.user!.id, req.body, req);
  res.json({ message: 'Password updated successfully.' });
};