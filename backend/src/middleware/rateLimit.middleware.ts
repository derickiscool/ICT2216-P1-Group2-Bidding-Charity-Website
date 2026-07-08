import type { Request, Response } from 'express';
import { audit } from '../services/audit.service';

export const rateLimitHandler = (action: string) => async (req: Request, res: Response): Promise<void> => {
  await audit(req, action, { path: req.originalUrl, method: req.method }, 'route', undefined, req.user?.id).catch(() => undefined);
  res.status(429).json({
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
  });
};
