import type { Request, Response } from 'express';
import { changePassword, updateProfile, requestEmailChange, verifyCurrentEmailForChange, confirmEmailChange } from '../services/profile.service';
import { clearSessionCookie } from '../services/session.service';

export const patchProfile = async (req: Request, res: Response): Promise<void> => {
  const user = await updateProfile(req.user!.id, req.body, req);
  res.json({ message: 'Profile updated successfully.', user });
};

export const putPassword = async (req: Request, res: Response): Promise<void> => {
  await changePassword(req.user!.id, req.body, req);
  res.json({ message: 'Password updated successfully.' });
};

export const postEmailChangeRequest = async (req: Request, res: Response): Promise<void> => {
  const result = await requestEmailChange(req.user!.id, req.body, req);
  res.status(202).json(result);
};

export const postEmailChangeVerifyCurrent = async (req: Request, res: Response): Promise<void> => {
  const result = await verifyCurrentEmailForChange(req.user!.id, req.body, req);
  res.status(202).json(result);
};

export const postEmailChangeConfirm = async (req: Request, res: Response): Promise<void> => {
  await confirmEmailChange(req.user!.id, req.body, req);
  // The change revokes all sessions; clear this browser's cookie so the user is fully logged out.
  clearSessionCookie(res);
  res.json({ message: 'Email updated. Please log in again with your new email.' });
};
