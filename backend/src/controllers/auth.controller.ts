import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';


export const register = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.beginRegistration(req.body, req);
  res.status(202).json(result);
};

export const verifyRegistration = async (req: Request, res: Response): Promise<void> => {
  const user = await authService.verifyRegistrationOtp(String(req.body.email ?? ''), String(req.body.otp ?? ''), req);
  res.status(201).json({ message: 'Account verified and created.', user });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.login(String(req.body.email ?? ''), String(req.body.password ?? ''), req, res);
  res.json(result);
};

export const me = async (req: Request, res: Response): Promise<void> => {
  res.json(req.user);
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  await authService.logout(req.sessionId, req, res);
  res.status(204).send();
};

export const requestLoginOtp = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.requestLoginOtp(String(req.body.email ?? ''), req);
  res.status(202).json(result);
};

export const verifyLoginOtp = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.verifyLoginOtp(
    String(req.body.email ?? ''),
    String(req.body.otp ?? ''),
    req,
    res
  );
  res.json(result);
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.requestPasswordReset(String(req.body.email ?? ''), req);
  res.json(result);
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const result = await authService.resetPassword(
    String(req.body.email ?? ''),
    String(req.body.token ?? ''),
    String(req.body.password ?? ''),
    req,
  );
  res.json(result);
};
