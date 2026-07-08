import type { Request, Response } from 'express';
import {
  changePassword,
  confirmCurrentEmailForChange,
  confirmNewEmailChange,
  requestEmailChange,
  requestPasswordChangeVerification,
  updateProfile,
} from '../services/profile.service';

export const patchProfile = async (req: Request, res: Response): Promise<void> => {
  const user = await updateProfile(req.user!.id, req.body, req);
  res.json({ message: 'Profile updated successfully.', user });
};

export const postPasswordVerification = async (req: Request, res: Response): Promise<void> => {
  const result = await requestPasswordChangeVerification(req.user!.id, req.body, req);
  res.status(202).json(result);
};

export const putPassword = async (req: Request, res: Response): Promise<void> => {
  await changePassword(req.user!.id, req.body, req);
  res.json({ message: 'Password updated successfully.' });
};

export const postEmailChangeRequest = async (req: Request, res: Response): Promise<void> => {
  const result = await requestEmailChange(req.user!.id, req.body, req);
  res.status(202).json(result);
};

export const postEmailChangeCurrentVerification = async (req: Request, res: Response): Promise<void> => {
  const result = await confirmCurrentEmailForChange(req.user!.id, req.body, req);
  res.status(202).json(result);
};

export const putEmail = async (req: Request, res: Response): Promise<void> => {
  const user = await confirmNewEmailChange(req.user!.id, req.body, req);
  res.json({ message: 'Email updated successfully.', user });
};
